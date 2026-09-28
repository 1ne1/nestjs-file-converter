-- AlterTable
ALTER TABLE "Permission" ADD COLUMN     "actions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Permission" ALTER COLUMN "actions" SET NOT NULL;

-- AlterTable (RolePermission had no rows, safe to swap the composite PK for a
-- single id column without a data backfill)
ALTER TABLE "RolePermission" DROP CONSTRAINT "RolePermission_pkey";
ALTER TABLE "RolePermission" ADD COLUMN     "id" TEXT,
ADD COLUMN     "actions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "RolePermission" ALTER COLUMN "actions" SET NOT NULL;
ALTER TABLE "RolePermission" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");
