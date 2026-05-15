import Capacitor
import StoreKit

@objc(IAPPlugin)
public class IAPPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "IAPPlugin"
    public let jsName = "IAP"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts",      returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase",         returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
    ]

    // Verfügbare Produkte von Apple laden
    @objc func getProducts(_ call: CAPPluginCall) {
        guard let ids = call.getArray("productIds") as? [String], !ids.isEmpty else {
            call.reject("productIds (Array) erforderlich")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: Set(ids))
                let result = products.map { p -> [String: Any] in [
                    "id":          p.id,
                    "title":       p.displayName,
                    "description": p.description,
                    "price":       p.displayPrice,
                ]}
                call.resolve(["products": result])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    // Kauf auslösen – gibt JWS-Transaction zurück
    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId erforderlich")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("Produkt nicht gefunden: \(productId)")
                    return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        await transaction.finish()
                        call.resolve([
                            "status":            "purchased",
                            "transactionId":     String(transaction.id),
                            "productId":         transaction.productID,
                            "jwsRepresentation": transaction.jwsRepresentation,
                        ])
                    case .unverified(_, let error):
                        call.reject("Transaktion nicht verifizierbar: \(error.localizedDescription)")
                    }
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                case .pending:
                    call.resolve(["status": "pending"])
                @unknown default:
                    call.reject("Unbekanntes Ergebnis")
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    // Bereits getätigte Käufe wiederherstellen
    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            var restored: [[String: Any]] = []
            for await result in Transaction.currentEntitlements {
                if case .verified(let transaction) = result {
                    restored.append([
                        "productId":         transaction.productID,
                        "transactionId":     String(transaction.id),
                        "jwsRepresentation": transaction.jwsRepresentation,
                    ])
                }
            }
            call.resolve(["transactions": restored])
        }
    }
}
