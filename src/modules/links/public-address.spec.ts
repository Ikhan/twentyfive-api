import { isIpLiteral, isPublicAddress } from './public-address.js';

describe('isPublicAddress', () => {
  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '151.101.1.164', '2606:4700::6810:84e5']) expect(isPublicAddress(ip)).toBe(true);
  });

  it('refuses private, local and special addresses, however they’re written', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '255.255.255.255',
      '::1',
      '[::1]',
      '::',
      'fc00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      '::ffff:10.0.0.1',
      'not-an-ip',
    ])
      expect(isPublicAddress(ip), ip).toBe(false);
  });

  it('knows an IP literal from a hostname', () => {
    expect(isIpLiteral('127.0.0.1')).toBe(true);
    expect(isIpLiteral('[::1]')).toBe(true);
    expect(isIpLiteral('example.com')).toBe(false);
  });
});
