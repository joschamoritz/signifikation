import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';

const STORAGE_KEY = 'sig-push-subscribed';

function isNative() {
  return Capacitor.isNativePlatform();
}

async function getPushNotifications() {
  if (!isNative()) return null;
  const { PushNotifications } = await import('@capacitor/push-notifications');
  return PushNotifications;
}

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
  const [permStatus, setPermStatus] = useState('...');

  const listenerRefs = useRef([]);

  // Permission-Status beim Mount abfragen
  useEffect(() => {
    if (!supported) return;
    getPushNotifications().then(async (PushNotifications) => {
      if (!PushNotifications) { setPermStatus('plugin-missing'); return; }
      try {
        const s = await Promise.race([
          PushNotifications.checkPermissions(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('bridge-timeout')), 5000)),
        ]);
        setPermStatus(s.receive);
      } catch (e) {
        setPermStatus('check-failed: ' + e?.message);
      }
    });
  }, [supported]);

  // Serverseitigen Status beim Mount abgleichen (nur auf Native)
  useEffect(() => {
    if (!supported) return;

    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await fetch('/api/v1/push/status', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const serverSubscribed = Boolean(data.subscribed);
        setSubscribed(serverSubscribed);
        try {
          localStorage.setItem(STORAGE_KEY, String(serverSubscribed));
        } catch { /* ignore */ }
      } catch { /* Netzwerkfehler – lokalen Cache-Wert behalten */ }
    }

    fetchStatus();
    return () => { cancelled = true; };
  }, [supported]);

  // Push-Tap-Listener: öffnet Root wenn App aus Hintergrund geöffnet wird
  useEffect(() => {
    if (!supported) return;

    let cleanedUp = false;

    async function registerTapListener() {
      const PushNotifications = await getPushNotifications();
      if (!PushNotifications || cleanedUp) return;

      const handle = await PushNotifications.addListener(
        'pushNotificationActionPerformed',
        () => {
          window.location.href = '/';
        },
      );
      listenerRefs.current.push(handle);
    }

    registerTapListener();

    return () => {
      cleanedUp = true;
      listenerRefs.current.forEach((h) => h.remove());
      listenerRefs.current = [];
    };
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported || requesting) return;
    setError(null);

    const PushNotifications = await getPushNotifications();
    if (!PushNotifications) {
      setError('Plugin nicht verfügbar');
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
        setError(`Berechtigung verweigert (${permStatus.receive})`);
        setRequesting(false);
        return;
      }

      // Token-Empfang via einmaliger Listener (mit 15s Timeout)
      await new Promise((resolve, reject) => {
        let regHandle;
        let errHandle;
        const timeout = setTimeout(() => reject(new Error('Timeout: kein Token erhalten (15s)')), 15000);

        async function cleanup() {
          clearTimeout(timeout);
          if (regHandle) await regHandle.remove();
          if (errHandle) await errHandle.remove();
        }

        PushNotifications.addListener('registration', async (token) => {
          await cleanup();
          try {
            const res = await fetch('/api/v1/push/subscribe', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ platform: 'ios', apns_token: token.value }),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              reject(new Error(err.error || 'Subscription failed'));
              return;
            }
            setSubscribed(true);
            try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* ignore */ }
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
    } catch (e) {
      setError(String(e?.message ?? e));
    } finally {
      setRequesting(false);
    }
  }, [supported, requesting]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;

    try {
      await fetch('/api/v1/push/unsubscribe', {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch { /* Netzwerkfehler ignorieren */ }

    setSubscribed(false);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }

    // Native-seitige Registrierung aufheben
    const PushNotifications = await getPushNotifications();
    if (PushNotifications) {
      try { await PushNotifications.unregister(); } catch { /* ignore */ }
    }
  }, [supported]);

  return { supported, subscribed, requesting, error, permStatus, subscribe, unsubscribe };
}
