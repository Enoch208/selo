export const roundTrip = {
  inbound: {
    txId: "JXU2INATXUJHE7WZGGWN25BPM6L2YEL6Q7LU5W3HICI4B5CX4JAQ",
    round: 65454635,
    amountUsdc: "1.00",
  },
  downstream: {
    txId: "ATF5HLYBBY4G5GYPNLCUMC5FXH22WIXI2QG3YP7M4WYPA5EHQTYQ",
    round: 65454637,
    amountUsdc: "0.01",
  },
  jobId: "job_GY5X6P4A3FSVXDEQ2VXP4EWAGR",
  target: "ORA Gate",
} as const;

export const seloFacts = {
  releaseTestPriceUsdc: "1.00",
  absoluteCapUsdc: "5.00",
  authorizationHours: 24,
  usdcAsaId: 31566704,
} as const;
