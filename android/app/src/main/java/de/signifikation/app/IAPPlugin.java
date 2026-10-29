package de.signifikation.app;

import androidx.annotation.NonNull;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

/**
 * Google Play Billing mit derselben JS-Schnittstelle wie ios/App/App/IAPPlugin.swift
 * (jsName "IAP", Aufrufer: src/plugins/iap.js).
 *
 * Unterschiede zu StoreKit:
 * - transactionId ist das purchaseToken; es steht zusätzlich als purchaseToken im Ergebnis.
 * - Bestätigt (acknowledge) wird auf dem Server nach der Freischaltung
 *   (server/routes/iapPlay.js). finishTransaction bestätigt nur noch als Rückfall.
 * - Gegenstück zu Transaction.updates: Beim Start und bei jeder Rückkehr in die
 *   App meldet transactionUpdate alle bezahlten, unbestätigten Käufe (Netzabbruch
 *   nach der Zahlung, ausstehende Zahlung inzwischen abgeschlossen). Unbestätigte
 *   Käufe erstattet Google nach drei Tagen von selbst.
 */
@CapacitorPlugin(name = "IAP")
public class IAPPlugin extends Plugin implements PurchasesUpdatedListener {

    private static final String TAG = "IAPPlugin";

    private BillingClient billing;
    private final List<Consumer<BillingResult>> wartend = new ArrayList<>();
    private boolean verbindet = false;
    private final Map<String, ProductDetails> details = new ConcurrentHashMap<>();

    // Laufender Kaufdialog (es gibt immer nur einen) und das gewünschte Produkt
    private PluginCall kaufCall;
    private String kaufProdukt;
    // Tokens, die schon über purchase() an JS gingen – nicht noch einmal als transactionUpdate melden
    private final Set<String> geliefert = Collections.newSetFromMap(new ConcurrentHashMap<>());

    @Override
    public void load() {
        billing = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection()
            .build();
        verbunden(r -> { if (ok(r)) meldeUnbestaetigte(); });
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (billing != null && billing.isReady()) meldeUnbestaetigte();
    }

    @Override
    protected void handleOnDestroy() {
        if (billing != null) billing.endConnection();
        super.handleOnDestroy();
    }

    // ── Verbindung ───────────────────────────────────────────────

    private static boolean ok(BillingResult r) {
        return r.getResponseCode() == BillingClient.BillingResponseCode.OK;
    }

    /** Führt aktion aus, sobald der BillingClient verbunden ist (oder mit dem Fehler). */
    private synchronized void verbunden(Consumer<BillingResult> aktion) {
        if (billing.isReady()) {
            aktion.accept(BillingResult.newBuilder().setResponseCode(BillingClient.BillingResponseCode.OK).build());
            return;
        }
        wartend.add(aktion);
        if (verbindet) return;
        verbindet = true;
        billing.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult result) {
                List<Consumer<BillingResult>> jetzt;
                synchronized (IAPPlugin.this) {
                    verbindet = false;
                    jetzt = new ArrayList<>(wartend);
                    wartend.clear();
                }
                if (!ok(result)) Logger.warn(TAG, "Billing-Verbindung fehlgeschlagen: " + result.getDebugMessage());
                for (Consumer<BillingResult> a : jetzt) a.accept(result);
            }

            @Override
            public void onBillingServiceDisconnected() {
                // enableAutoServiceReconnection verbindet beim nächsten Aufruf selbst neu
                synchronized (IAPPlugin.this) { verbindet = false; }
            }
        });
    }

    private static String fehlertext(BillingResult r) {
        String msg = r.getDebugMessage();
        return "Google Play Billing: " + r.getResponseCode() + (msg == null || msg.isEmpty() ? "" : " – " + msg);
    }

    // ── Produkte ─────────────────────────────────────────────────

    private void ladeDetails(List<String> ids, Consumer<BillingResult> fertig) {
        List<QueryProductDetailsParams.Product> produkte = new ArrayList<>();
        for (String id : ids) {
            produkte.add(QueryProductDetailsParams.Product.newBuilder()
                .setProductId(id)
                .setProductType(BillingClient.ProductType.INAPP)
                .build());
        }
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder().setProductList(produkte).build();
        billing.queryProductDetailsAsync(params, (result, ergebnis) -> {
            if (ok(result)) {
                for (ProductDetails pd : ergebnis.getProductDetailsList()) details.put(pd.getProductId(), pd);
            }
            fertig.accept(result);
        });
    }

    private static ProductDetails.OneTimePurchaseOfferDetails angebot(ProductDetails pd) {
        List<ProductDetails.OneTimePurchaseOfferDetails> liste = pd.getOneTimePurchaseOfferDetailsList();
        return liste == null || liste.isEmpty() ? null : liste.get(0);
    }

    @PluginMethod
    public void getProducts(PluginCall call) {
        List<String> ids;
        try {
            JSArray arr = call.getArray("productIds");
            ids = arr == null ? null : arr.toList();
        } catch (JSONException e) {
            ids = null;
        }
        if (ids == null || ids.isEmpty()) {
            call.reject("productIds (Array) erforderlich");
            return;
        }
        final List<String> gesucht = ids;
        verbunden(verbindung -> {
            if (!ok(verbindung)) { call.reject(fehlertext(verbindung)); return; }
            ladeDetails(gesucht, result -> {
                if (!ok(result)) { call.reject(fehlertext(result)); return; }
                JSArray products = new JSArray();
                for (String id : gesucht) {
                    ProductDetails pd = details.get(id);
                    ProductDetails.OneTimePurchaseOfferDetails offer = pd == null ? null : angebot(pd);
                    if (offer == null) continue;
                    JSObject p = new JSObject();
                    p.put("id", pd.getProductId());
                    p.put("title", pd.getName());
                    p.put("description", pd.getDescription());
                    p.put("price", offer.getFormattedPrice());
                    products.put(p);
                }
                JSObject ret = new JSObject();
                ret.put("products", products);
                call.resolve(ret);
            });
        });
    }

    // ── Kauf ─────────────────────────────────────────────────────

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        String accountToken = call.getString("appAccountToken");
        if (productId == null) { call.reject("productId erforderlich"); return; }
        // Der Server nimmt nur gebundene Käufe an (obfuscatedExternalAccountId)
        if (accountToken == null || accountToken.isEmpty()) { call.reject("appAccountToken erforderlich"); return; }
        synchronized (this) {
            if (kaufCall != null) { call.reject("Es läuft bereits ein Kauf"); return; }
            kaufCall = call;
            kaufProdukt = productId;
        }
        verbunden(verbindung -> {
            if (!ok(verbindung)) { beendeKauf().reject(fehlertext(verbindung)); return; }
            if (details.containsKey(productId)) {
                starteKauf(productId, accountToken);
                return;
            }
            ladeDetails(Collections.singletonList(productId), result -> {
                if (!ok(result) || !details.containsKey(productId)) {
                    beendeKauf().reject("Produkt nicht gefunden: " + productId);
                    return;
                }
                starteKauf(productId, accountToken);
            });
        });
    }

    private synchronized PluginCall beendeKauf() {
        PluginCall c = kaufCall;
        kaufCall = null;
        kaufProdukt = null;
        return c;
    }

    private void starteKauf(String productId, String accountToken) {
        ProductDetails pd = details.get(productId);
        BillingFlowParams.ProductDetailsParams.Builder produkt = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(pd);
        ProductDetails.OneTimePurchaseOfferDetails offer = angebot(pd);
        if (offer != null && offer.getOfferToken() != null) produkt.setOfferToken(offer.getOfferToken());
        BillingFlowParams params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(Collections.singletonList(produkt.build()))
            .setObfuscatedAccountId(accountToken)
            .build();
        getActivity().runOnUiThread(() -> {
            BillingResult r = billing.launchBillingFlow(getActivity(), params);
            if (!ok(r)) {
                PluginCall c = beendeKauf();
                if (c != null) c.reject(fehlertext(r));
            }
        });
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult result, List<Purchase> purchases) {
        PluginCall call;
        String produkt;
        synchronized (this) {
            call = kaufCall;
            produkt = kaufProdukt;
        }
        if (call == null) {
            // Ohne laufenden Dialog: z. B. eine ausstehende Zahlung, die gerade abgeschlossen wurde
            if (ok(result) && purchases != null) for (Purchase p : purchases) melde(p);
            return;
        }
        int code = result.getResponseCode();
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            beendeKauf();
            call.resolve(status("cancelled"));
            return;
        }
        if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            // Schon gekauft (z. B. vor einer Neuinstallation): den vorhandenen Kauf liefern,
            // der Server schaltet frei oder meldet, dass er einem anderen Konto gehört
            alleKaeufe(liste -> {
                Purchase vorhanden = null;
                if (liste != null) for (Purchase p : liste) {
                    if (p.getProducts().contains(produkt) && p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) vorhanden = p;
                }
                beendeKauf();
                if (vorhanden == null) call.reject(fehlertext(result));
                else call.resolve(gekauft(vorhanden, produkt));
            });
            return;
        }
        if (!ok(result) || purchases == null) {
            beendeKauf();
            call.reject(fehlertext(result));
            return;
        }
        Purchase passend = null;
        for (Purchase p : purchases) {
            if (p.getProducts().contains(produkt)) passend = p;
            else melde(p);
        }
        beendeKauf();
        if (passend == null) {
            call.reject("Kauf ohne passendes Produkt");
        } else if (passend.getPurchaseState() == Purchase.PurchaseState.PENDING) {
            call.resolve(status("pending"));
        } else {
            call.resolve(gekauft(passend, produkt));
        }
    }

    private static JSObject status(String s) {
        JSObject o = new JSObject();
        o.put("status", s);
        return o;
    }

    private JSObject gekauft(Purchase p, String produkt) {
        geliefert.add(p.getPurchaseToken());
        JSObject o = transaktion(p, produkt);
        o.put("status", "purchased");
        return o;
    }

    private static JSObject transaktion(Purchase p, String produkt) {
        JSObject o = new JSObject();
        o.put("productId", produkt);
        o.put("transactionId", p.getPurchaseToken());
        o.put("purchaseToken", p.getPurchaseToken());
        if (p.getOrderId() != null) o.put("orderId", p.getOrderId());
        return o;
    }

    /** Bezahlten, unbestätigten Kauf an den globalen JS-Listener melden (iapTransactionListener.js). */
    private void melde(Purchase p) {
        if (p.getPurchaseState() != Purchase.PurchaseState.PURCHASED || p.isAcknowledged()) return;
        if (geliefert.contains(p.getPurchaseToken())) return;
        for (String produkt : p.getProducts()) {
            // retainUntilConsumed wie unter iOS: beim Kaltstart hängt der JS-Listener evtl. noch nicht
            notifyListeners("transactionUpdate", transaktion(p, produkt), true);
        }
    }

    private void meldeUnbestaetigte() {
        alleKaeufe(liste -> { if (liste != null) for (Purchase p : liste) melde(p); });
    }

    /** Eigene Einmalkäufe aus dem Play-Cache; null bei Fehler. */
    private void alleKaeufe(Consumer<List<Purchase>> fertig) {
        verbunden(verbindung -> {
            if (!ok(verbindung)) { fertig.accept(null); return; }
            QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.INAPP)
                .build();
            billing.queryPurchasesAsync(params, (result, liste) -> {
                if (!ok(result)) Logger.warn(TAG, "queryPurchases: " + result.getDebugMessage());
                fertig.accept(ok(result) ? liste : null);
            });
        });
    }

    // ── Abschluss und Wiederherstellen ───────────────────────────

    /**
     * Rückfall zum Acknowledge auf dem Server – erst nach dessen Freischaltung aufrufen.
     * Ein schon bestätigter Kauf ist kein Fehler.
     */
    @PluginMethod
    public void finishTransaction(PluginCall call) {
        String token = call.getString("transactionId");
        if (token == null || token.isEmpty()) { call.reject("transactionId (String) erforderlich"); return; }
        alleKaeufe(liste -> {
            Purchase kauf = null;
            if (liste != null) for (Purchase p : liste) if (token.equals(p.getPurchaseToken())) kauf = p;
            if (kauf == null || kauf.isAcknowledged()) { call.resolve(); return; }
            AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder().setPurchaseToken(token).build();
            billing.acknowledgePurchase(params, r -> {
                if (!ok(r)) Logger.warn(TAG, "acknowledgePurchase: " + r.getDebugMessage());
                call.resolve();
            });
        });
    }

    @PluginMethod
    public void restorePurchases(PluginCall call) {
        alleKaeufe(liste -> {
            if (liste == null) { call.reject("Käufe konnten nicht von Google Play geladen werden"); return; }
            JSArray restored = new JSArray();
            for (Purchase p : liste) {
                if (p.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
                for (String produkt : p.getProducts()) restored.put(transaktion(p, produkt));
            }
            JSObject ret = new JSObject();
            ret.put("transactions", restored);
            call.resolve(ret);
        });
    }
}
