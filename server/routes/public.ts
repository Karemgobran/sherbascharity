import { Router } from 'express';
import { db } from '../db.ts';

export const publicRouter = Router();

// Public charity overview: strictly non-PII, live DB aggregations only
publicRouter.get('/public/overview', (_req, res) => {
  const settings = db
    .prepare(`
      SELECT name_ar, tagline_ar, registration_number, address_ar, phone, email,
             website_domain, donation_instructions_ar, bank_transfer_info_ar,
             vodafone_cash_info_ar, instapay_info_ar
      FROM charity_settings WHERE id = 1
    `)
    .get();

  const approvedDonations = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt FROM donations WHERE status = 'approved'")
    .get() as { total: number; cnt: number };

  const approvedExpenses = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE status IN ('approved', 'paid')")
    .get() as { total: number };

  const projectsCount = db
    .prepare('SELECT COUNT(*) AS cnt FROM projects WHERE is_public = 1 AND is_archived = 0')
    .get() as { cnt: number };

  const activeDonorsCount = db
    .prepare("SELECT COUNT(*) AS cnt FROM persons WHERE person_type = 'donor' AND status = 'active'")
    .get() as { cnt: number };

  const completedAidsCount = db
    .prepare("SELECT COUNT(*) AS cnt FROM aids WHERE status IN ('approved', 'disbursed')")
    .get() as { cnt: number };

  const hasDemoCount = (
    db
      .prepare(`
        SELECT (
          (SELECT COUNT(*) FROM donations WHERE is_demo = 1) +
          (SELECT COUNT(*) FROM projects WHERE is_demo = 1) +
          (SELECT COUNT(*) FROM persons WHERE is_demo = 1)
        ) AS c
      `)
      .get() as { c: number }
  ).c;

  const projects = db
    .prepare(`
      SELECT
        p.id, p.code, p.record_kind, p.is_demo, p.title_ar, p.category_ar, p.description_ar, p.goal_ar,
        p.image_url, p.target_budget, p.fund_type, p.start_date, p.end_date, p.status,
        COALESCE((SELECT SUM(d.amount) FROM donations d WHERE d.project_id = p.id AND d.status = 'approved'), 0) AS approved_donations,
        COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.project_id = p.id AND e.status IN ('approved', 'paid')), 0) AS approved_expenses
      FROM projects p
      WHERE p.is_public = 1 AND p.is_archived = 0
      ORDER BY p.created_at DESC
    `)
    .all() as Array<Record<string, unknown>>;

  const projectUpdates = db
    .prepare(`
      SELECT pu.id, pu.project_id, pu.title_ar, pu.details_ar, pu.progress_percent, pu.created_at
      FROM project_updates pu
      JOIN projects p ON p.id = pu.project_id
      WHERE p.is_public = 1 AND p.is_archived = 0
      ORDER BY pu.created_at DESC
      LIMIT 12
    `)
    .all();

  res.json({
    settings,
    hasDemoData: hasDemoCount > 0,
    stats: {
      approvedDonationsTotal: approvedDonations.total,
      approvedDonationsCount: approvedDonations.cnt,
      approvedExpensesTotal: approvedExpenses.total,
      remainingBalance: Math.max(0, approvedDonations.total - approvedExpenses.total),
      publicProjectsCount: projectsCount.cnt,
      activeDonorsCount: activeDonorsCount.cnt,
      completedAidsCount: completedAidsCount.cnt,
    },
    projects: projects.map((p) => {
      const target = Number(p.target_budget || 0);
      const donated = Number(p.approved_donations || 0);
      const spent = Number(p.approved_expenses || 0);
      return {
        ...p,
        remaining_balance: donated - spent,
        funding_percentage: target > 0 ? Math.min(100, Math.round((donated / target) * 100)) : 0,
      };
    }),
    projectUpdates,
  });
});
