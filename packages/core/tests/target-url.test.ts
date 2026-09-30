import { describe, expect, it } from "vitest";
import { classifyAddress, classifyHostname, targetCovered } from "../src/target-url";

const blockedIpv4: readonly (readonly [string, string, string, string])[] = [
  ["0.0.0.0/8", "0.0.0.0", "0.255.255.255", "1.0.0.0"],
  ["10.0.0.0/8", "10.0.0.0", "10.255.255.255", "11.0.0.0"],
  ["100.64.0.0/10", "100.64.0.0", "100.127.255.255", "100.128.0.0"],
  ["127.0.0.0/8", "127.0.0.0", "127.255.255.255", "128.0.0.0"],
  ["169.254.0.0/16", "169.254.0.0", "169.254.255.255", "169.255.0.0"],
  ["172.16.0.0/12", "172.16.0.0", "172.31.255.255", "172.32.0.0"],
  ["192.0.0.0/24", "192.0.0.0", "192.0.0.255", "192.0.1.0"],
  ["192.0.2.0/24", "192.0.2.0", "192.0.2.255", "192.0.3.0"],
  ["192.88.99.0/24", "192.88.99.0", "192.88.99.255", "192.88.100.0"],
  ["192.168.0.0/16", "192.168.0.0", "192.168.255.255", "192.169.0.0"],
  ["198.18.0.0/15", "198.18.0.0", "198.19.255.255", "198.20.0.0"],
  ["198.51.100.0/24", "198.51.100.0", "198.51.100.255", "198.51.101.0"],
  ["203.0.113.0/24", "203.0.113.0", "203.0.113.255", "203.0.114.0"],
];

const justBelow: readonly (readonly [string, string])[] = [
  ["10.0.0.0/8", "9.255.255.255"],
  ["100.64.0.0/10", "100.63.255.255"],
  ["169.254.0.0/16", "169.253.255.255"],
  ["172.16.0.0/12", "172.15.255.255"],
  ["192.0.0.0/24", "191.255.255.255"],
  ["192.88.99.0/24", "192.88.98.255"],
  ["192.168.0.0/16", "192.167.255.255"],
  ["198.18.0.0/15", "198.17.255.255"],
  ["198.51.100.0/24", "198.51.99.255"],
  ["203.0.113.0/24", "203.0.112.255"],
  ["224.0.0.0/4", "223.255.255.255"],
];

describe("classifyAddress IPv4", () => {
  it("A10 (pure): private and local addresses are classified blocked", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "169.254.169.254", "100.100.1.1"]) {
      expect(classifyAddress(ip), ip).toBe("blocked");
    }
    for (const ip of ["::1", "fd00:ec2::254", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(classifyAddress(ip), ip).toBe("blocked");
    }
  });

  it.each(blockedIpv4)("blocks %s from first to last and allows just outside", (_, a, b, c) => {
    expect(classifyAddress(a)).toBe("blocked");
    expect(classifyAddress(b)).toBe("blocked");
    expect(classifyAddress(c)).toBe("public");
  });

  it.each(justBelow)("allows the address just below %s", (_, ip) => {
    expect(classifyAddress(ip)).toBe("public");
  });

  it("blocks multicast and reserved space including broadcast", () => {
    for (const ip of ["224.0.0.0", "239.255.255.255", "240.0.0.0", "255.255.255.255"]) {
      expect(classifyAddress(ip), ip).toBe("blocked");
    }
  });

  it("classifies ordinary public addresses as public", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "223.255.255.255"]) {
      expect(classifyAddress(ip), ip).toBe("public");
    }
  });

  it("rejects malformed IPv4 strings as invalid", () => {
    const bad = [
      "",
      "1.2.3",
      "1.2.3.4.5",
      "256.0.0.1",
      "01.2.3.4",
      "1.2.3.-4",
      "a.b.c.d",
      " 1.2.3.4",
    ];
    for (const ip of bad) {
      expect(classifyAddress(ip), ip).toBe("invalid");
    }
  });
});

describe("classifyAddress IPv6", () => {
  it("blocks the listed IPv6 ranges in compressed and expanded forms", () => {
    const blocked = [
      "::",
      "0:0:0:0:0:0:0:0",
      "::1",
      "0000:0000:0000:0000:0000:0000:0000:0001",
      "fc00::",
      "fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
      "fd00:ec2::254",
      "FD00:EC2::254",
      "fe80::1",
      "febf:ffff::1",
      "fec0::1",
      "feff::1",
      "ff00::",
      "ff02::1",
      "2001:db8::1",
      "2001:0db8:ffff::1",
      "100::1",
      "100::ffff:ffff:ffff:ffff",
      "2001::1",
      "2001:0:ffff::1",
    ];
    for (const ip of blocked) {
      expect(classifyAddress(ip), ip).toBe("blocked");
    }
  });

  it("allows global unicast just outside the blocked ranges", () => {
    const allowed = [
      "2606:4700:4700::1111",
      "2001:4860:4860::8888",
      "2001:db9::1",
      "2001:1::1",
      "2003::1",
      "2001:0db7:ffff:ffff:ffff:ffff:ffff:ffff",
    ];
    for (const ip of allowed) {
      expect(classifyAddress(ip), ip).toBe("public");
    }
  });

  it("blocks space outside global unicast such as 100:0:0:1::", () => {
    expect(classifyAddress("100:0:0:1::")).toBe("blocked");
    expect(classifyAddress("4000::1")).toBe("blocked");
  });

  it("classifies IPv4-mapped, compatible, NAT64 and 6to4 by the embedded IPv4", () => {
    const cases: readonly (readonly [string, string])[] = [
      ["::ffff:127.0.0.1", "blocked"],
      ["::ffff:7f00:1", "blocked"],
      ["0:0:0:0:0:ffff:169.254.169.254", "blocked"],
      ["::ffff:8.8.8.8", "public"],
      ["::ffff:0808:0808", "public"],
      ["::10.0.0.1", "blocked"],
      ["::8.8.8.8", "public"],
      ["64:ff9b::192.168.0.1", "blocked"],
      ["64:ff9b::c0a8:1", "blocked"],
      ["64:ff9b::8.8.8.8", "public"],
      ["2002:c0a8:0101::1", "blocked"],
      ["2002:0a00:0001::", "blocked"],
      ["2002:0808:0808::1", "public"],
    ];
    for (const [ip, expected] of cases) {
      expect(classifyAddress(ip), ip).toBe(expected);
    }
  });

  it("blocks zone-scoped addresses and rejects malformed IPv6", () => {
    expect(classifyAddress("fe80::1%lo0")).toBe("blocked");
    const bad = [
      ":",
      ":::",
      "1::2::3",
      "1:2:3:4:5:6:7:8:9",
      "1:2:3:4:5:6:7",
      "12345::1",
      "g::1",
      "::ffff:1.2.3",
      "::ffff:1.2.3.4:5",
      "1:2:3:4:5:6:7::8",
      "%lo0",
      "[::1]",
    ];
    for (const ip of bad) {
      expect(classifyAddress(ip), ip).toBe("invalid");
    }
  });
});

describe("classifyHostname", () => {
  it.each([
    ["example.com", "ok"],
    ["API.Example.COM.", "ok"],
    ["sub.example.co.uk", "ok"],
    ["LOCALHOST.", "blocked_name"],
    ["localhost", "blocked_name"],
    ["app.localhost", "blocked_name"],
    ["api.local", "blocked_name"],
    ["metadata.google.internal", "blocked_name"],
    ["METADATA.GOOGLE.INTERNAL.", "blocked_name"],
    ["router.home.arpa", "blocked_name"],
    ["nas.lan", "blocked_name"],
    ["intranet", "blocked_name"],
    ["intranet.", "blocked_name"],
    ["", "blocked_name"],
    [".", "blocked_name"],
    ["127.0.0.1", "ip_literal"],
    ["8.8.8.8", "ip_literal"],
    ["[::1]", "ip_literal"],
    ["::1", "ip_literal"],
    ["[2606:4700::1111]", "ip_literal"],
    ["1.2.3", "ip_literal"],
    ["example.0x7f", "ip_literal"],
    ["foo.123", "ip_literal"],
  ] as const)("%s is %s", (hostname, expected) => {
    expect(classifyHostname(hostname)).toBe(expected);
  });
});

describe("targetCovered", () => {
  const authorized = {
    origin: "https://api.example.com",
    routePath: "/v1/quote",
    method: "GET",
  } as const;

  it("covers exactly the authorized origin, path and method", () => {
    expect(
      targetCovered(authorized, {
        origin: "https://api.example.com",
        path: "/v1/quote",
        method: "GET",
      }),
    ).toBe(true);
  });

  it.each([
    ["another origin", { origin: "https://evil.example.com", path: "/v1/quote", method: "GET" }],
    [
      "a port-qualified origin",
      { origin: "https://api.example.com:8443", path: "/v1/quote", method: "GET" },
    ],
    ["an http origin", { origin: "http://api.example.com", path: "/v1/quote", method: "GET" }],
    ["a sub-path", { origin: "https://api.example.com", path: "/v1/quote/extra", method: "GET" }],
    ["a prefix path", { origin: "https://api.example.com", path: "/v1", method: "GET" }],
    ["a trailing slash", { origin: "https://api.example.com", path: "/v1/quote/", method: "GET" }],
    [
      "a different case path",
      { origin: "https://api.example.com", path: "/V1/quote", method: "GET" },
    ],
    ["another method", { origin: "https://api.example.com", path: "/v1/quote", method: "POST" }],
  ] as const)("does not cover %s", (_, requested) => {
    expect(targetCovered(authorized, requested)).toBe(false);
  });
});
