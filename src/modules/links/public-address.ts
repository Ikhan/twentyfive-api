import ipaddr from 'ipaddr.js';

/**
 * True only for public internet addresses. Private, loopback, link-local (e.g. cloud metadata at
 * 169.254.169.254), carrier-grade NAT, multicast, reserved and tunnelled/embedded forms are refused, so a
 * link can't make the API reach into its own network (SSRF).
 */
export function isPublicAddress(address: string): boolean {
  const host = address.replace(/^\[|\]$/g, '');
  if (!ipaddr.isValid(host)) return false;
  // ::ffff:10.0.0.1 is really 10.0.0.1.
  const ip = ipaddr.process(host);
  return ip.range() === 'unicast';
}

/** Whether `host` is written as an IP address (then no DNS lookup happens before connecting). */
export const isIpLiteral = (host: string): boolean => ipaddr.isValid(host.replace(/^\[|\]$/g, ''));
