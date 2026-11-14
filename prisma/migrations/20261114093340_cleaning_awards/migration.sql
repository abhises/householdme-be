-- CreateTable
CREATE TABLE "CleaningService" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "website" TEXT,
    "logoUrl" TEXT,
    "googleRating" DOUBLE PRECISION,
    "googleReviews" INTEGER,
    "yelpRating" DOUBLE PRECISION,
    "yelpReviews" INTEGER,
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "licensed" BOOLEAN NOT NULL DEFAULT false,
    "insured" BOOLEAN NOT NULL DEFAULT false,
    "backgroundChecked" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CleaningService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Award" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "score" DOUBLE PRECISION,
    "whyItWon" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT true,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Award_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CleaningService_slug_key" ON "CleaningService"("slug");

-- CreateIndex
CREATE INDEX "CleaningService_state_city_idx" ON "CleaningService"("state", "city");

-- CreateIndex
CREATE INDEX "Award_year_state_city_rank_idx" ON "Award"("year", "state", "city", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "Award_serviceId_year_state_city_key" ON "Award"("serviceId", "year", "state", "city");

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "CleaningService"("id") ON DELETE CASCADE ON UPDATE CASCADE;
