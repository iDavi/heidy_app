import { x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { randomBytes, utf8ToBytes } from "@noble/hashes/utils";
import type { LoginKey } from "../api/types";

const INFO = utf8ToBytes("heidy-login-v1");
const ZERO_SALT = new Uint8Array(32);

export type LoginEnvelope = {
  key_id: string;
  enc: string;
  ciphertext: string;
  encrypted_at: string;
};

export async function sealPassword(loginKey: LoginKey, password: string): Promise<LoginEnvelope> {
  const recipientPublic = base64ToBytes(loginKey.public_key);
  const ephemeralPrivate = randomBytes(32);
  const ephemeralPublic = x25519.getPublicKey(ephemeralPrivate);
  const sharedSecret = x25519.getSharedSecret(ephemeralPrivate, recipientPublic);
  const keyBytes = hkdf(sha256, sharedSecret, ZERO_SALT, INFO, 32);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: INFO, tagLength: 128 },
      key,
      utf8ToBytes(password)
    )
  );

  return {
    key_id: loginKey.key_id,
    enc: bytesToBase64(ephemeralPublic),
    ciphertext: bytesToBase64(concatBytes(nonce, sealed)),
    encrypted_at: new Date().toISOString()
  };
}

function concatBytes(left: Uint8Array, right: Uint8Array) {
  const out = new Uint8Array(left.length + right.length);
  out.set(left);
  out.set(right, left.length);
  return out;
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";

  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}
