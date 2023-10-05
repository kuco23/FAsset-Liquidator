import BN from 'bn.js'

interface BaseAsset {
  name: string
  symbol: string
  decimals: number
  ftsoSymbol: string
  ftsoDecimals: number
  defaultPriceUsd5: BN
}

export interface CollateralAsset extends BaseAsset {
  kind: "vault" | "pool"
  minCollateralRatioBips: BN
}

export interface UnderlyingAsset extends BaseAsset {
  amgDecimals: number
  lotSize: number
}

export interface AssetConfig {
  asset: UnderlyingAsset
  vault: CollateralAsset
  pool: CollateralAsset
}

export interface EcosystemConfig {
  name: string
  // ftso prices
  assetFtsoPrice: BN
  vaultFtsoPrice: BN
  poolFtsoPrice: BN
  // dex(vault, f-asset)
  dex1VaultReserve: BN
  dex1FAssetReserve: BN
  // dex(pool, vault)
  dex2PoolReserve: BN
  dex2VaultReserve: BN
  // agent settings
  mintedUBA: BN
  vaultCollateral: BN
  poolCollateral: BN
  // asset manager settings
  liquidationFactorBips: BN
  liquidationFactorVaultBips: BN
  // expected implicit data
  expectedVaultCrBips: BN
  expectedPoolCrBips: BN
}