-- CreateTable
CREATE TABLE `Analytics` (
    `address` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `volume` BIGINT NOT NULL,
    `fees` BIGINT NOT NULL,
    `token0Locked` BIGINT NOT NULL,
    `token1Locked` BIGINT NOT NULL,
    `usdLocked` INTEGER NOT NULL,

    PRIMARY KEY (`date`, `address`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Price` (
    `address` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `open` DOUBLE NOT NULL,
    `close` DOUBLE NOT NULL,
    `high` DOUBLE NOT NULL,
    `low` DOUBLE NOT NULL,

    PRIMARY KEY (`date`, `address`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Swap` (
    `poolAddress` VARCHAR(191) NOT NULL,
    `swapForY` BOOLEAN NOT NULL,
    `binId` INTEGER NOT NULL,
    `amountIn` BIGINT NOT NULL,
    `amountOut` BIGINT NOT NULL,
    `timestamp` DATETIME(3) NOT NULL,
    `txHash` VARCHAR(191) NOT NULL,
    `usdValue` DOUBLE NOT NULL,

    PRIMARY KEY (`txHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Liquidity` (
    `poolAddress` VARCHAR(191) NOT NULL,
    `amount0` BIGINT NOT NULL,
    `amount1` BIGINT NOT NULL,
    `timestamp` DATETIME(3) NOT NULL,
    `txHash` VARCHAR(191) NOT NULL,
    `lowerBound` INTEGER NOT NULL,
    `upperBound` INTEGER NOT NULL,
    `usdValue` DOUBLE NOT NULL,

    PRIMARY KEY (`txHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

