
-- Seed exam_papers with data matching actual questions in the DB
INSERT INTO public.exam_papers (exam_type, exam_name, year, total_questions, duration_minutes, difficulty_level) VALUES
-- JEE Main papers
('JEE Main', 'JEE Main', 2026, 90, 180, 'HARD'),
('JEE Main', 'JEE Main', 2025, 90, 180, 'HARD'),
('JEE Main', 'JEE Main', 2024, 90, 180, 'HARD'),
('JEE Main', 'JEE Main', 2023, 90, 180, 'HARD'),
('JEE Main', 'JEE Main', 2022, 90, 180, 'HARD'),
('JEE Main', 'JEE Main', 2021, 90, 180, 'HARD'),
('JEE Main', 'JEE Main', 2020, 90, 180, 'HARD'),
('JEE Main', 'JEE Main', 2019, 90, 180, 'HARD'),
('JEE Main', 'JEE Main', 2018, 90, 180, 'HARD'),
('JEE Main', 'JEE Main', 2017, 90, 180, 'MEDIUM'),
('JEE Main', 'JEE Main', 2016, 90, 180, 'MEDIUM'),
-- NEET UG papers
('NEET UG', 'NEET UG', 2026, 180, 200, 'HARD'),
('NEET UG', 'NEET UG', 2025, 180, 200, 'HARD'),
('NEET UG', 'NEET UG', 2024, 180, 200, 'HARD'),
('NEET UG', 'NEET UG', 2023, 180, 200, 'HARD'),
('NEET UG', 'NEET UG', 2022, 180, 200, 'HARD'),
('NEET UG', 'NEET UG', 2021, 180, 200, 'MEDIUM'),
('NEET UG', 'NEET UG', 2020, 180, 200, 'MEDIUM'),
('NEET UG', 'NEET UG', 2019, 180, 200, 'MEDIUM'),
('NEET UG', 'NEET UG', 2018, 180, 200, 'MEDIUM'),
('NEET UG', 'NEET UG', 2017, 180, 200, 'MEDIUM'),
('NEET UG', 'NEET UG', 2016, 180, 200, 'MEDIUM'),
-- SSC CGL papers
('SSC CGL', 'SSC CGL', 2026, 100, 60, 'MEDIUM'),
('SSC CGL', 'SSC CGL', 2025, 100, 60, 'MEDIUM'),
('SSC CGL', 'SSC CGL', 2024, 100, 60, 'MEDIUM'),
('SSC CGL', 'SSC CGL', 2023, 100, 60, 'MEDIUM'),
('SSC CGL', 'SSC CGL', 2022, 100, 60, 'MEDIUM'),
('SSC CGL', 'SSC CGL', 2021, 100, 60, 'MEDIUM'),
('SSC CGL', 'SSC CGL', 2020, 100, 60, 'MEDIUM'),
('SSC CGL', 'SSC CGL', 2019, 100, 60, 'MEDIUM'),
('SSC CGL', 'SSC CGL', 2018, 100, 60, 'MEDIUM'),
('SSC CGL', 'SSC CGL', 2017, 100, 60, 'MEDIUM'),
('SSC CGL', 'SSC CGL', 2016, 100, 60, 'MEDIUM'),
-- UPSC CSE papers
('UPSC CSE', 'UPSC CSE', 2026, 100, 120, 'HARD'),
('UPSC CSE', 'UPSC CSE', 2025, 100, 120, 'HARD'),
('UPSC CSE', 'UPSC CSE', 2024, 100, 120, 'HARD'),
('UPSC CSE', 'UPSC CSE', 2023, 100, 120, 'HARD'),
-- IBPS PO papers
('IBPS PO', 'IBPS PO', 2026, 100, 60, 'MEDIUM'),
('IBPS PO', 'IBPS PO', 2025, 100, 60, 'MEDIUM'),
('IBPS PO', 'IBPS PO', 2024, 100, 60, 'MEDIUM'),
('IBPS PO', 'IBPS PO', 2023, 100, 60, 'MEDIUM'),
('IBPS PO', 'IBPS PO', 2022, 100, 60, 'MEDIUM'),
('IBPS PO', 'IBPS PO', 2021, 100, 60, 'MEDIUM'),
('IBPS PO', 'IBPS PO', 2020, 100, 60, 'MEDIUM'),
('IBPS PO', 'IBPS PO', 2019, 100, 60, 'MEDIUM'),
('IBPS PO', 'IBPS PO', 2018, 100, 60, 'MEDIUM'),
('IBPS PO', 'IBPS PO', 2017, 100, 60, 'MEDIUM'),
('IBPS PO', 'IBPS PO', 2016, 100, 60, 'MEDIUM')
ON CONFLICT DO NOTHING;

-- Also add admin INSERT policy so future seeding can be done from dashboard
CREATE POLICY "exam_papers_admin_all" ON public.exam_papers FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
