package de.signifikation.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Lokale Plugins vor super.onCreate registrieren (Capacitor lädt sie dort)
        registerPlugin(IAPPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
