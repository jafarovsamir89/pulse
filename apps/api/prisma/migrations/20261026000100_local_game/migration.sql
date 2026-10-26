CREATE TABLE "LocalGameRoom" (
  "id" TEXT NOT NULL,
  "state" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LocalGameRoom_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LocalGameRoom_expiresAt_idx" ON "LocalGameRoom"("expiresAt");
