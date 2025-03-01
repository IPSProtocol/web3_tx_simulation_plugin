export function shortenAddress(address: string): string {
  if (!address) return '';
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// export function isValidAddress(address: string): boolean {
//   return /^0x[a-fA-F0-9]{40}$/.test(address);
// }

export function normalizeAddress(address: string): string {
  return address.toLowerCase();
} 