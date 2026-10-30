#!/usr/bin/env bash
# Erzeugt die Test-PKI für iap.apple-jws.test.js (nur Tests, keine echten Apple-Schlüssel).
# Aufruf aus diesem Ordner: bash erzeugen.sh   (Git Bash: MSYS_NO_PATHCONV wird hier gesetzt)
set -euo pipefail
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")"
TAGE=7300

ec() { openssl ecparam -name prime256v1 -genkey -noout -out "$1.key" 2>/dev/null; openssl pkcs8 -topk8 -nocrypt -in "$1.key" -out "$1.key.tmp" && mv "$1.key.tmp" "$1.key"; }
signiere() { # name aussteller subjekt erweiterungen
  printf '%s\n' "$4" > "$1.ext"
  openssl req -new -key "$1.key" -subj "$3" -out "$1.csr"
  openssl x509 -req -in "$1.csr" -CA "$2.pem" -CAkey "$2.key" -CAcreateserial -days "$TAGE" -sha256 -extfile "$1.ext" -out "$1.pem" 2>/dev/null
  rm -f "$1.csr" "$1.ext"
}

ec root
openssl req -x509 -new -key root.key -subj "/CN=Test Root CA" -days "$TAGE" -sha256 \
  -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" -out root.pem

CA_EXT=$'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign'
LEAF_EXT=$'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature'

ec inter;          signiere inter root "/CN=Test Intermediate" "$CA_EXT"$'\n1.2.840.113635.100.6.2.1=ASN1:NULL'
ec inter2;         signiere inter2 root "/CN=Test Intermediate 2" "$CA_EXT"$'\n1.2.840.113635.100.6.2.1=ASN1:NULL'
ec inter-ohne-oid; signiere inter-ohne-oid root "/CN=Test Intermediate ohne OID" "$CA_EXT"
ec leaf;           signiere leaf inter "/CN=Test Leaf" "$LEAF_EXT"$'\n1.2.840.113635.100.6.11.1=ASN1:NULL'
ec leaf-ohne-oid;  signiere leaf-ohne-oid inter "/CN=Test Leaf ohne OID" "$LEAF_EXT"
ec leaf-unter-ohne; signiere leaf-unter-ohne inter-ohne-oid "/CN=Test Leaf unter Intermediate ohne OID" "$LEAF_EXT"$'\n1.2.840.113635.100.6.11.1=ASN1:NULL'
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out leaf-rsa.key 2>/dev/null
signiere leaf-rsa inter "/CN=Test Leaf RSA" "$LEAF_EXT"$'\n1.2.840.113635.100.6.11.1=ASN1:NULL'

rm -f ./*.srl
ls -1
