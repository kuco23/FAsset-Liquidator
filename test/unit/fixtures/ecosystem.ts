import { lotSizeUba, randBigInt, randBigIntInRelRadius } from "../helpers/utils"
import { priceBasedInitialDexReserve, collateralForAgentCr, convertUsd5ToTokens, roundUpWithPrecision } from "../../calculations"
import type { AssetConfig, EcosystemConfig } from "./interface"


export class EcosystemFactory {
  // fixed default values
  protected defaultDex1FAssetReserve: bigint
  protected defaultDex2VaultReserve: bigint
  protected defaultMintedUBA: bigint
  // fixed example ecosystem configs
  public baseEcosystem: EcosystemConfig
  public healthyEcosystemWithVaultUnderwater: EcosystemConfig
  public healthyEcosystemWithPoolUnderwater: EcosystemConfig
  public healthyEcosystemWithZeroVaultCollateral: EcosystemConfig
  public healthyEcosystemWithZeroPoolCollateral: EcosystemConfig
  public semiHealthyEcosystemWithHighSlippage: EcosystemConfig
  public unhealthyEcosystemWithHighFAssetDexPrice: EcosystemConfig
  public unhealthyEcosystemWithBadDebt: EcosystemConfig

  constructor(public config: AssetConfig) {
    // customly configured reserves and minted f-assets (by their value in usd5)
    const defaultDex1LiquidityUsd5 = BigInt(10) ** BigInt(5 + 9) // billion$
    const defaultDex2LiquidityUsd5 = BigInt(10) ** BigInt(5 + 9) // billion$
    const defaultMintedFAssetValueUsd5 = BigInt(10) ** BigInt(5 + 6) // million$
    // convert to actual reserves and minted f-assets
    this.defaultDex1FAssetReserve = convertUsd5ToTokens(
      defaultDex1LiquidityUsd5,
      config.asset.decimals,
      config.asset.defaultPriceUsd5
    )
    this.defaultDex2VaultReserve = convertUsd5ToTokens(
      defaultDex2LiquidityUsd5,
      config.vault.decimals,
      config.vault.defaultPriceUsd5
    )
    this.defaultMintedUBA = roundUpWithPrecision( // in lots
      convertUsd5ToTokens(
        defaultMintedFAssetValueUsd5,
        config.asset.decimals,
        config.asset.defaultPriceUsd5
      ),
      lotSizeUba(config.asset)
    )
    // get fixed example ecosystem configs
    this.baseEcosystem = this.getBaseEcosystem()
    this.healthyEcosystemWithVaultUnderwater = this.getHealthyEcosystemWithVaultUnderwater()
    this.healthyEcosystemWithPoolUnderwater = this.getHealthyEcosystemWithPoolUnderwater()
    this.healthyEcosystemWithZeroVaultCollateral = this.getHealthyEcosystemWithZeroVaultCollateral()
    this.healthyEcosystemWithZeroPoolCollateral = this.getHealthyEcosystemWithZeroPoolCollateral()
    this.semiHealthyEcosystemWithHighSlippage = this.getSemiHealthyEcosystemWithHighSlippage()
    this.unhealthyEcosystemWithHighFAssetDexPrice = this.getUnhealthyEcosystemWithHighFAssetDexPrice()
    this.unhealthyEcosystemWithBadDebt = this.getUnhealthyEcosystemWithBadDebt()
  }

  protected getBaseEcosystem(): EcosystemConfig {
    // set liquidation factors such that reward is half the pool's min cr backing overflow,
    // and it is covered by the pool, while vault covers the exact value of liquidated f-assets
    const liquidationFactorBips = (this.config.pool.minCollateralRatioBips + BigInt(10_000)) / BigInt(2)
    const liquidationFactorVaultBips = BigInt(10_000) // vault covers the value, pool covers reward
    return {
      name: 'base healthy ecosystem config',
      // ftso prices reflect the real ones (in usd5)
      assetFtsoPrice: this.config.asset.defaultPriceUsd5,
      vaultFtsoPrice: this.config.vault.defaultPriceUsd5,
      poolFtsoPrice: this.config.pool.defaultPriceUsd5,
      // dexes are sufficiently liquidated and
      // reserves are aligned with ftso prices
      dex1FAssetReserve: this.defaultDex1FAssetReserve,
      dex1VaultReserve: priceBasedInitialDexReserve(
        this.config.asset.defaultPriceUsd5,
        this.config.vault.defaultPriceUsd5,
        this.config.asset.decimals,
        this.config.vault.decimals,
        this.defaultDex1FAssetReserve
      ),
      dex2VaultReserve: this.defaultDex2VaultReserve,
      dex2PoolReserve: priceBasedInitialDexReserve(
        this.config.vault.defaultPriceUsd5,
        this.config.pool.defaultPriceUsd5,
        this.config.vault.decimals,
        this.config.pool.decimals,
        this.defaultDex2VaultReserve
      ),
      // we set agent collateral such that
      // collateral ratios are stable
      mintedUBA: this.defaultMintedUBA,
      vaultCollateral: collateralForAgentCr(
        this.config.vault.minCollateralRatioBips,
        this.defaultMintedUBA,
        this.config.asset.defaultPriceUsd5,
        this.config.vault.defaultPriceUsd5,
        this.config.asset.decimals,
        this.config.vault.decimals
      ),
      poolCollateral: collateralForAgentCr(
        this.config.pool.minCollateralRatioBips,
        this.defaultMintedUBA,
        this.config.asset.defaultPriceUsd5,
        this.config.pool.defaultPriceUsd5,
        this.config.asset.decimals,
        this.config.pool.decimals
      ),
      fullLiquidation: false,
      // asset manager has reasonable liquidation settings
      liquidationFactorBips: liquidationFactorBips,
      liquidationFactorVaultBips: liquidationFactorVaultBips,
      // configs should implicitly set the following data
      expectedVaultCrBips: this.config.vault.minCollateralRatioBips,
      expectedPoolCrBips: this.config.pool.minCollateralRatioBips
    }
  }

  protected getHealthyEcosystemWithVaultUnderwater(): EcosystemConfig {
    const vaultCrBips = (this.config.vault.minCollateralRatioBips + BigInt(10_000)) / BigInt(2)
    return {
      ...this.baseEcosystem,
      name: 'vault cr underwater',
      vaultCollateral: collateralForAgentCr(
        vaultCrBips,
        this.defaultMintedUBA,
        this.baseEcosystem.assetFtsoPrice,
        this.baseEcosystem.vaultFtsoPrice,
        this.config.asset.decimals,
        this.config.vault.decimals
      ),
      expectedVaultCrBips: vaultCrBips
    }
  }

  protected getHealthyEcosystemWithPoolUnderwater(): EcosystemConfig {
    const poolCrBips = (this.config.pool.minCollateralRatioBips + BigInt(10_000)) / BigInt(2)
    return {
      ...this.baseEcosystem,
      name: 'pool cr underwater',
      poolCollateral: collateralForAgentCr(
        poolCrBips,
        this.defaultMintedUBA,
        this.baseEcosystem.assetFtsoPrice,
        this.baseEcosystem.poolFtsoPrice,
        this.config.asset.decimals,
        this.config.pool.decimals
      ),
      expectedPoolCrBips: poolCrBips
    }
  }

  protected getHealthyEcosystemWithZeroVaultCollateral(): EcosystemConfig {
    return {
      ...this.baseEcosystem,
      name: 'vault cr is 0, pool ftw',
      vaultCollateral: BigInt(0),
      expectedVaultCrBips: BigInt(0)
    }
  }

  protected getHealthyEcosystemWithZeroPoolCollateral(): EcosystemConfig {
    return {
      ...this.baseEcosystem,
      name: 'pool cr is 0, vault ftw',
      poolCollateral: BigInt(0),
      expectedPoolCrBips: BigInt(0)
    }
  }

  protected getSemiHealthyEcosystemWithHighSlippage(): EcosystemConfig {
    return {
      ...this.healthyEcosystemWithVaultUnderwater,
      name: 'arbitrage not possible, dex1 has too high slippage due to low liquidity',
      // make dex1 f-assets have same price but low liquidity
      dex1FAssetReserve: this.defaultMintedUBA * BigInt(10) / BigInt(9),
      dex1VaultReserve: priceBasedInitialDexReserve(
        this.config.asset.defaultPriceUsd5,
        this.config.vault.defaultPriceUsd5,
        this.config.asset.decimals,
        this.config.vault.decimals,
        this.defaultMintedUBA * BigInt(10) / BigInt(9)
      ),
      // force full liquidation
      vaultCollateral: BigInt(0),
      expectedVaultCrBips: BigInt(0)
    }
  }

  protected getUnhealthyEcosystemWithHighFAssetDexPrice(): EcosystemConfig {
    return {
      ...this.healthyEcosystemWithVaultUnderwater,
      name: 'arbitrage not possible, dex1 f-asset price too high',
      // make dex f-assets 100x more expensive than on the ftso
      dex1FAssetReserve: this.healthyEcosystemWithVaultUnderwater.dex1FAssetReserve / BigInt(100),
    }
  }

  protected getUnhealthyEcosystemWithBadDebt(): EcosystemConfig {
    return {
      ...this.baseEcosystem,
      name: 'vault and pool cr combined is below 1, causing bad debt',
      vaultCollateral: collateralForAgentCr(
        BigInt(5000),
        this.baseEcosystem.mintedUBA,
        this.baseEcosystem.assetFtsoPrice,
        this.baseEcosystem.vaultFtsoPrice,
        this.config.asset.decimals,
        this.config.vault.decimals
      ),
      poolCollateral: collateralForAgentCr(
        BigInt(4000),
        this.baseEcosystem.mintedUBA,
        this.baseEcosystem.assetFtsoPrice,
        this.baseEcosystem.poolFtsoPrice,
        this.config.asset.decimals,
        this.config.pool.decimals
      ),
      expectedVaultCrBips: BigInt(5000),
      expectedPoolCrBips: BigInt(4000)
    }
  }

  protected randomizeEcosystem(ecosystem: EcosystemConfig, name: string): EcosystemConfig {
    // slightly randomized crs (combined ratio must still be > 1)
    const vaultCrBips = randBigInt(
      this.config.vault.minCollateralRatioBips / BigInt(2),
      this.config.vault.minCollateralRatioBips - BigInt(100)
    )
    const poolCrBips = randBigInt(
      this.config.pool.minCollateralRatioBips * BigInt(4) / BigInt(5),
      this.config.vault.minCollateralRatioBips * BigInt(2)
    )
    // slightly randomized ftso prices
    const ftsoPrices = {
      assetFtsoPrice: randBigIntInRelRadius(ecosystem.assetFtsoPrice, 2),
      vaultFtsoPrice: randBigIntInRelRadius(ecosystem.vaultFtsoPrice, 1),
      poolFtsoPrice: randBigIntInRelRadius(ecosystem.poolFtsoPrice, 2),
    }
    // randomized config
    return {
      ...ecosystem,
      ...ftsoPrices,
      name: name,
      // slightly randomized dex reserves
      dex1VaultReserve: randBigIntInRelRadius(ecosystem.dex1VaultReserve, 2),
      dex1FAssetReserve: randBigIntInRelRadius(ecosystem.dex1FAssetReserve, 2),
      dex2PoolReserve: randBigIntInRelRadius(ecosystem.dex2PoolReserve, 2),
      dex2VaultReserve: randBigIntInRelRadius(ecosystem.dex2VaultReserve, 2),
      // slightly randomized minted f-assets
      vaultCollateral: collateralForAgentCr(
        vaultCrBips,
        ecosystem.mintedUBA,
        ftsoPrices.assetFtsoPrice,
        ftsoPrices.vaultFtsoPrice,
        this.config.asset.decimals,
        this.config.vault.decimals
      ),
      poolCollateral: collateralForAgentCr(
        poolCrBips,
        ecosystem.mintedUBA,
        ftsoPrices.assetFtsoPrice,
        ftsoPrices.poolFtsoPrice,
        this.config.asset.decimals,
        this.config.pool.decimals
      ),
      fullLiquidation: Math.random() > 0.5,
      expectedVaultCrBips: vaultCrBips,
      expectedPoolCrBips: poolCrBips
    }
  }

  public getHealthyEcosystems(count: number): EcosystemConfig[] {
    const configs: EcosystemConfig[] = [
      this.healthyEcosystemWithVaultUnderwater,
      this.healthyEcosystemWithPoolUnderwater,
      this.healthyEcosystemWithZeroVaultCollateral,
      this.healthyEcosystemWithZeroPoolCollateral
    ]
    for (let i = 0; i < count; i++) {
      configs.push(this.randomizeEcosystem(
        this.baseEcosystem,
        `randomized healthy ecosystem ${i}`))
    }
    return configs
  }

  public getSemiHealthyEcosystems(count: number): EcosystemConfig[] {
    const configs: EcosystemConfig[] = [
      this.semiHealthyEcosystemWithHighSlippage
    ]
    for (let i = 0; i < count; i++) {
      configs.push(this.randomizeEcosystem(
        this.semiHealthyEcosystemWithHighSlippage,
        `randomized semi-healthy ecosystem ${i}`))
    }
    return configs
  }

  public getUnhealthyEcosystems(count: number): EcosystemConfig[] {
    const configs: EcosystemConfig[] = [
      this.unhealthyEcosystemWithHighFAssetDexPrice,
      this.unhealthyEcosystemWithBadDebt
    ]
    return configs
  }
}