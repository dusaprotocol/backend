/*
  Warnings:

  - The primary key for the `Analytics` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `address` on the `Analytics` table. All the data in the column will be lost.
  - You are about to alter the column `volume` on the `Analytics` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `fees` on the `Analytics` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to drop the `Price` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `close` to the `Analytics` table without a default value. This is not possible if the table is not empty.
  - Added the required column `high` to the `Analytics` table without a default value. This is not possible if the table is not empty.
  - Added the required column `low` to the `Analytics` table without a default value. This is not possible if the table is not empty.
  - Added the required column `open` to the `Analytics` table without a default value. This is not possible if the table is not empty.
  - Added the required column `poolAddress` to the `Analytics` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Analytics` DROP PRIMARY KEY,
    DROP COLUMN `address`,
    ADD COLUMN `close` DOUBLE NOT NULL,
    ADD COLUMN `high` DOUBLE NOT NULL,
    ADD COLUMN `low` DOUBLE NOT NULL,
    ADD COLUMN `open` DOUBLE NOT NULL,
    ADD COLUMN `poolAddress` VARCHAR(191) NOT NULL,
    MODIFY `volume` INTEGER NOT NULL,
    MODIFY `fees` INTEGER NOT NULL,
    ADD PRIMARY KEY (`poolAddress`, `date`);

-- DropTable
DROP TABLE `Price`;

-- CreateTable
CREATE TABLE `Token` (
    `address` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `symbol` VARCHAR(191) NOT NULL,
    `decimals` INTEGER NOT NULL,

    PRIMARY KEY (`address`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Pool` (
    `address` VARCHAR(191) NOT NULL,
    `binStep` INTEGER NOT NULL,
    `token0Address` VARCHAR(191) NOT NULL,
    `token1Address` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`address`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
