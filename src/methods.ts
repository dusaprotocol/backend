import { base58Decode } from "@massalabs/massa-web3/dist/utils/Xbqcrypto";

export const isAddressValid = (address: string) =>
    address.startsWith("A1") && (address.length === 52 || address.length === 51);

export const getBytesPublicKey = (publicKey: string): Uint8Array => {
    const publicKeyVersionBase58Decoded: Buffer = base58Decode(publicKey.slice(1));
    const publicKeyBase58Decoded = publicKeyVersionBase58Decoded.slice(1);
    return publicKeyBase58Decoded;
};
