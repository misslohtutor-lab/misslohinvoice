-- CreateIndex
CREATE INDEX "Adjustment_familyId_idx" ON "Adjustment"("familyId");

-- CreateIndex
CREATE INDEX "Lesson_studentId_idx" ON "Lesson"("studentId");

-- CreateIndex
CREATE INDEX "Lesson_status_idx" ON "Lesson"("status");

-- CreateIndex
CREATE INDEX "Student_familyId_idx" ON "Student"("familyId");
