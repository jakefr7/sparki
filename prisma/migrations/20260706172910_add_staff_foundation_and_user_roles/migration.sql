/*
  Warnings:

  - You are about to drop the column `deactivatedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Role` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_UserRoles` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `firstName` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lastName` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `role` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'PRACTICE_MANAGER', 'FRONT_DESK', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT', 'CLIENT');

-- DropForeignKey
ALTER TABLE "Role" DROP CONSTRAINT "Role_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "_UserRoles" DROP CONSTRAINT "_UserRoles_A_fkey";

-- DropForeignKey
ALTER TABLE "_UserRoles" DROP CONSTRAINT "_UserRoles_B_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "deactivatedAt",
DROP COLUMN "name",
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "firstName" TEXT NOT NULL,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastName" TEXT NOT NULL,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "role" "UserRole" NOT NULL;

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "assignedTechnicianId" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "lastUpdatedById" TEXT,
ADD COLUMN     "primaryVeterinarianId" TEXT;

-- DropTable
DROP TABLE "Role";

-- DropTable
DROP TABLE "_UserRoles";

-- CreateTable
CREATE TABLE "StaffProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobTitle" TEXT,
    "licenseNumber" TEXT,
    "canReceiveAppointments" BOOLEAN NOT NULL DEFAULT false,
    "canOwnVisits" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_userId_key" ON "StaffProfile"("userId");

-- CreateIndex
CREATE INDEX "User_organizationId_role_idx" ON "User"("organizationId", "role");

-- CreateIndex
CREATE INDEX "Visit_primaryVeterinarianId_idx" ON "Visit"("primaryVeterinarianId");

-- CreateIndex
CREATE INDEX "Visit_assignedTechnicianId_idx" ON "Visit"("assignedTechnicianId");

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_primaryVeterinarianId_fkey" FOREIGN KEY ("primaryVeterinarianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_assignedTechnicianId_fkey" FOREIGN KEY ("assignedTechnicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_lastUpdatedById_fkey" FOREIGN KEY ("lastUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
