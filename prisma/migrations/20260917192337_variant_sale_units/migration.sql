/*
  Warnings:

  - You are about to drop the column `allowsFractional` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `displayFactor` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `unitLabel` on the `products` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "allowsFractional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "displayFactor" DECIMAL(18,3) NOT NULL DEFAULT 1,
ADD COLUMN     "unitLabel" TEXT NOT NULL DEFAULT 'قطعة';

-- AlterTable
ALTER TABLE "products" DROP COLUMN "allowsFractional",
DROP COLUMN "displayFactor",
DROP COLUMN "unitLabel";
