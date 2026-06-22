#!/usr/bin/env bash
# Generate a self-signed TLS certificate for the Warranty receiver.
#
# The cert is marked as a CA and includes the PC's IP in the SAN, so it can be:
#   - used by the server  (-cert cert.pem -key key.pem), AND
#   - installed on each phone as a trusted CA certificate (Android Settings ->
#     Security -> Install a certificate -> CA certificate), which makes the app
#     trust https://<IP>:<port>.
#
# Usage:   ./gen-cert.sh 10.0.0.9
# Output:  cert.pem (give to phones + server) and key.pem (server only, keep secret)

set -euo pipefail

IP="${1:-}"
if [ -z "$IP" ]; then
  echo "Usage: $0 <PC-IP>   e.g. $0 10.0.0.9" >&2
  exit 1
fi

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout key.pem -out cert.pem -days 3650 \
  -subj "/CN=Warranty Receiver ${IP}" \
  -addext "subjectAltName=IP:${IP}" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,digitalSignature,keyCertSign"

echo
echo "Created:"
echo "  cert.pem  -> install on phones as a CA certificate; pass to server -cert"
echo "  key.pem   -> server only (-key), keep secret"
echo
echo "Run the receiver over HTTPS, e.g.:"
echo "  ./warranty-receiver -dir \"/data/warranty-cases\" -token \"СЕКРЕТ\" -addr \":8443\" -cert cert.pem -key key.pem"
echo "In the app set the address to:  https://${IP}:8443"
