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

  const listenerRefs = useRef([]);

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

    const PushNotifications = await getPushNotifications();
    if (!PushNotifications) return;

    setRequesting(true);

    try {
      // Permission-Status abfragen
      let permStatus = await PushNotifications.checkPermissions();

      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        setRequesting(false);
        return;
      }

      // Token-Empfang via einmaliger Listener
      await new Promise((resolve, reject) => {
        let regHandle;
        let errHandle;

        async function cleanup() {
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
          reject(new Error(err.error?.message || 'Registration error'));
        }).then((h) => { errHandle = h; });

        PushNotifications.register();
      });
    } catch (e) {
      // Fehler still – kein Stack Trace an Konsole
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

  return { supported, subscribed, requesting, subscribe, unsubscribe };
}
