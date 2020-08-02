#!/usr/bin/env sh

KEY_CHAIN=build.keychain
MACOS_CERT_P12_FILE=certificate.p12

# Recreate the certificate from the secure environment variable
echo $MACOS_CERT_P12 | base64 --decode > $MACOS_CERT_P12_FILE

#create a keychain
security create-keychain -p actions $KEY_CHAIN

# Make the keychain the default so identities are found
security default-keychain -s $KEY_CHAIN

# Unlock the keychain
security unlock-keychain -p actions $KEY_CHAIN

security import $MACOS_CERT_P12_FILE -k $KEY_CHAIN -P $MACOS_CERT_PASSWORD -T /usr/bin/codesign;

security set-key-partition-list -S apple-tool:,apple: -s -k actions $KEY_CHAIN

# remove certs
rm -fr *.p12
