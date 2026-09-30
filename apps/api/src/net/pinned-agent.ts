import type { LookupFunction } from "node:net";
import { isIP } from "node:net";
import { Agent, buildConnector } from "undici";

const connectTimeoutMs = 5_000;

export interface Pin {
  readonly hostname: string;
  readonly address: string;
  readonly connectPort?: number | undefined;
}

function pinnedLookup(pin: Pin): LookupFunction {
  const family = isIP(pin.address);
  return (hostname, options, callback) => {
    if (hostname !== pin.hostname) {
      callback(new Error(`no vetted address for ${hostname}`), "");
      return;
    }
    if (options.all === true) {
      callback(null, [{ address: pin.address, family }]);
      return;
    }
    callback(null, pin.address, family);
  };
}

export function createPinnedAgent(pin: Pin): Agent {
  const connect = buildConnector({ lookup: pinnedLookup(pin), timeout: connectTimeoutMs });
  const port = pin.connectPort;
  return new Agent({
    pipelining: 0,
    connect:
      port === undefined
        ? connect
        : (options, callback) => {
            connect({ ...options, port: String(port) }, callback);
          },
  });
}
