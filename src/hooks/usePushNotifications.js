import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications as _PushNotificationsPlugin } from '@capacitor/push-notifications';
import { API } from '../config';
import { apiFetch } from '../utils/apiFetch';

const STORAGE_KEY = 'sig-push-subscribed';

function isNative() {
  // Bewusst iOS-only: der Server kennt nur platform 'web'|'ios'
  // (routes/push.js, APNs). Ein Android-Geraet wuerde sonst sein
  // FCM-Token als apns_token registrieren — kaputte Subscription.
  // Bei Android-Support: Server-Schema + FCM-Sender zuerst.
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

function getPushNotifications() {
  if (!isNative()) return null;
  return _PushNotificationsPlugin;
}

// Gerät bei APNs registrieren und das Token an den Server melden. Wird beim
// Einschalten UND bei jedem Öffnen der Einstellungen (still) aufgerufen: Nach
// einer Neuinstallation oder wenn Apple das Token erneuert, kennt der Server
// sonst nur das alte Token — der Schalter stünde auf „an", es käme aber keine
// Erinnerung mehr an. Der Server legt bekannte Tokens nicht doppelt an.
function registerDevice(PushNotifications) {
  return new Promise((resolve, reject) => {
    let regHandle;
    let errHandle;
    const timeout = setTimeout(() => reject(new Error('timeout')), 15000);

    async function cleanup() {
      clearTimeout(timeout);
      if (regHandle) await regHandle.remove();
      if (errHandle) await errHandle.remove();
    }

    PushNotifications.addListener('registration', async (token) => {
      await cleanup();
      try {
        const res = await apiFetch(`${API}/push/subscribe`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: 'ios', apns_token: token.value }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          reject(new Error(err.error || 'subscribe-failed'));
          return;
        }
        resolve();
      } catch (e) {
        reject(e);
      }
    }).then((h) => { regHandle = h; });

    PushNotifications.addListener('registrationError', async (err) => {
      await cleanup();
      reject(new Error('registrationError: ' + (err.error?.message || JSON.stringify(err.error))));
    }).then((h) => { errHandle = h; });

    PushNotifications.register();
  });
}

const DENIED_TEXT = 'Mitteilungen sind für Signifikation ausgeschaltet. Du kannst sie in den iOS-Einstellungen unter Signifikation › Mitteilungen erlauben.';
const FAILED_TEXT = 'Die Erinnerung ließ sich gerade nicht einschalten. Bitte versuche es später noch einmal.';

export function usePushNotifications() {
  const supported = isNative();

  const [subscribed, setSubscribed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState(null);
  const [permStatus, setPermStatus] = useState(null);


  // Permission-Status beim Mount abfragen
  useEffect(() => {
    if (!supported) return;
    const PushNotifications = getPushNotifications();
    if (!PushNotifications) { setPermStatus('plugin-missing'); return; }
    (async () => {
      try {
        const s = await Promise.race([
          PushNotifications.checkPermissions(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('bridge-timeout')), 5000)),
        ]);
        setPermStatus(s.receive);
      } catch (e) {
        setPermStatus('check-failed: ' + e?.message);
      }
    })();
  }, [supported]);

  // Status beim Mount abgleichen (nur auf Native). Gilt als eingeschaltet, wenn
  // das Gerät es sich gemerkt hat ODER der Server ein Abo zum Konto kennt (nach
  // einer Neuinstallation ist der lokale Wert weg). Dann das Token still
  // auffrischen — aber nur mit erteilter Berechtigung; hat jemand Mitteilungen
  // in den iOS-Einstellungen abgeschaltet, zeigt der Schalter das ehrlich an.
  useEffect(() => {
    if (!supported) return;

    let cancelled = false;

    async function syncStatus() {
      let wanted = false;
      try { wanted = localStorage.getItem(STORAGE_KEY) === 'true'; } catch { /* ignore */ }
      try {
        const res = await apiFetch(`${API}/push/status`, { credentials: 'include' });
        if (res.ok) wanted = wanted || Boolean((await res.json()).subscribed);
      } catch { /* Netzwerkfehler – lokalen Wert behalten */ }
      if (cancelled || !wanted) return;

      const PushNotifications = getPushNotifications();
      if (!PushNotifications) return;
      let perm = null;
      try { perm = (await PushNotifications.checkPermissions()).receive; } catch { /* Bridge-Fehler */ }
      if (cancelled) return;
      if (perm && perm !== 'granted') {
        setSubscribed(false);
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        return;
      }
      setSubscribed(true);
      try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* ignore */ }
      if (perm === 'granted') registerDevice(PushNotifications).catch(() => {});
    }

    syncStatus();
    return () => { cancelled = true; };
  }, [supported]);

  // Kein eigener Tap-Listener: Ein Tipp auf die Erinnerung öffnet die App
  // ohnehin. Bis 1.5.0 lud er die Seite neu (`location.href = '/'`), aber nur,
  // solange dieser Block gerade gemountet war; den neuen Tag lädt seitdem
  // useDayRollover nach.

  const subscribe = useCallback(async () => {
    if (!supported || requesting) return;
    setError(null);

    const PushNotifications = getPushNotifications();
    if (!PushNotifications) {
      setError(FAILED_TEXT);
      return;
    }

    setRequesting(true);

    try {
      // Permission-Status abfragen
      let permStatus = await PushNotifications.checkPermissions();

      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        setError(DENIED_TEXT);
        return;
      }

      await registerDevice(PushNotifications);
      setSubscribed(true);
      try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* ignore */ }
    } catch {
      setError(FAILED_TEXT);
    } finally {
      setRequesting(false);
    }
  }, [supported, requesting]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;

    try {
      await apiFetch(`${API}/push/unsubscribe`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch { /* Netzwerkfehler ignorieren */ }

    setSubscribed(false);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }

    // Native-seitige Registrierung aufheben
    const PushNotifications = getPushNotifications();
    if (PushNotifications) {
      try { await PushNotifications.unregister(); } catch { /* ignore */ }
    }
  }, [supported]);

  return { supported, subscribed, requesting, error, permStatus, subscribe, unsubscribe };
}
