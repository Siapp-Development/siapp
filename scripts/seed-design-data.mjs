#!/usr/bin/env node
/**
 * Design-QA seed (emulator-only) — layers realistic demo content on top of
 * seed-auth-emulator.mjs so dashboard + portal screens can be reviewed with
 * representative data: clients, collaborators, projects across lifecycles,
 * tasks in every bucket (mine / overdue / due-this-week / blocked), and
 * milestones for the portal timespan bar.
 *
 * Usage: node scripts/seed-auth-emulator.mjs && node scripts/seed-design-data.mjs
 */

import process from 'node:process';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'siapp-prod';
const WID = 'dev-workspace';

const app = initializeApp({ projectId: PROJECT_ID });
const auth = getAuth(app);
const db = getFirestore(app);

const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (n) => new Date(Date.now() + n * DAY);

async function main() {
  const now = FieldValue.serverTimestamp();
  const owner = await auth.getUserByEmail('owner@siapp.test');
  const pm = await auth.getUserByEmail('pm@siapp.test');

  // --- Clients -------------------------------------------------------------
  const clients = [
    { id: 'cl-tan', name: 'Adrian Tan', companyName: 'Tan Residences', phone: '+60123001001', email: 'adrian@tanres.example', language: 'en' },
    { id: 'cl-lim', name: 'Grace Lim', companyName: 'Lim & Sons Holdings', phone: '+60123001002', email: 'grace@limsons.example', language: 'en' },
    { id: 'cl-raj', name: 'Priya Rajan', companyName: 'Rajan Ventures', phone: '+60123001003', language: 'ms' },
  ];
  for (const c of clients) {
    await db.doc(`workspaces/${WID}/clients/${c.id}`).set({
      ...c, createdAt: now, createdBy: owner.uid,
    });
  }

  // --- Collaborators --------------------------------------------------------
  const collaborators = [
    { id: 'co-wong', name: 'Wong Kam Fai', phone: '+60123002001', company: 'KF Electrical', trade: 'Electrical', type: 'subcontractor', status: 'active' },
    { id: 'co-siti', name: 'Siti Aminah', phone: '+60123002002', company: 'SA Interiors', trade: 'Carpentry', type: 'supplier', status: 'active' },
    { id: 'co-kumar', name: 'Kumar Selvan', phone: '+60123002003', trade: 'Plumbing', type: 'subcontractor', status: 'active' },
  ];
  for (const c of collaborators) {
    await db.doc(`workspaces/${WID}/collaborators/${c.id}`).set({
      ...c, createdAt: now, invitedBy: owner.uid,
    });
  }

  // --- Projects --------------------------------------------------------------
  const baseSummary = { totalTasks: 0, doneTasks: 0, overdueTasks: 0, blockedTasks: 0, progressPct: 0, lastActivityAt: new Date() };
  const projects = [
    {
      id: 'pr-bungalow', name: 'Damansara Bungalow Renovation', code: 'DBR-24',
      vertical: 'construction', lifecycle: 'published', status: 'active',
      clientId: 'cl-tan', clientNameDenorm: 'Adrian Tan',
      startDate: daysFromNow(-45), targetEndDate: daysFromNow(60),
      publishedAt: daysFromNow(-40),
      summary: { ...baseSummary, totalTasks: 12, doneTasks: 7, overdueTasks: 2, blockedTasks: 1, progressPct: 58 },
      visibility: { clientCanSee: true, collaboratorsCount: 3 },
    },
    {
      id: 'pr-office', name: 'Bangsar Office Fit-Out', code: 'BOF-11',
      vertical: 'construction', lifecycle: 'published', status: 'active',
      clientId: 'cl-lim', clientNameDenorm: 'Grace Lim',
      startDate: daysFromNow(-20), targetEndDate: daysFromNow(35),
      publishedAt: daysFromNow(-18),
      summary: { ...baseSummary, totalTasks: 8, doneTasks: 2, overdueTasks: 0, progressPct: 25 },
      visibility: { clientCanSee: true, collaboratorsCount: 2 },
    },
    {
      id: 'pr-audit', name: 'Rajan Ventures — Shareholder Agreement', code: 'RV-SA',
      vertical: 'legal', lifecycle: 'published', status: 'on_hold',
      clientId: 'cl-raj', clientNameDenorm: 'Priya Rajan',
      startDate: daysFromNow(-90), targetEndDate: daysFromNow(-5),
      publishedAt: daysFromNow(-85),
      summary: { ...baseSummary, totalTasks: 6, doneTasks: 4, overdueTasks: 2, progressPct: 67 },
      visibility: { clientCanSee: true, collaboratorsCount: 0 },
    },
    {
      id: 'pr-showroom', name: 'PJ Showroom Concept', code: 'PSC-02',
      vertical: 'construction', lifecycle: 'draft', status: 'active',
      clientId: 'cl-lim', clientNameDenorm: 'Grace Lim',
      startDate: daysFromNow(7),
      summary: { ...baseSummary },
      visibility: { clientCanSee: false, collaboratorsCount: 0 },
    },
    {
      id: 'pr-clinic', name: 'TTDI Clinic Refurbishment', code: 'TCR-09',
      vertical: 'construction', lifecycle: 'completed', status: 'active',
      clientId: 'cl-tan', clientNameDenorm: 'Adrian Tan',
      startDate: daysFromNow(-180), targetEndDate: daysFromNow(-30), actualEndDate: daysFromNow(-26),
      publishedAt: daysFromNow(-175), completedAt: daysFromNow(-26),
      summary: { ...baseSummary, totalTasks: 15, doneTasks: 15, progressPct: 100 },
      visibility: { clientCanSee: true, collaboratorsCount: 1 },
    },
  ];
  for (const p of projects) {
    await db.doc(`workspaces/${WID}/projects/${p.id}`).set({
      ...p, ownerUid: owner.uid, ownerNameDenorm: 'Dev Owner',
      createdAt: now, updatedAt: now, createdBy: owner.uid,
    });
  }

  // --- Milestones (portal timespan bar) ---------------------------------------
  const milestones = [
    { id: 'ms-demo', name: 'Demolition & hacking', targetDate: daysFromNow(-30), completedAt: daysFromNow(-28), order: 1 },
    { id: 'ms-wiring', name: 'Electrical first fix', targetDate: daysFromNow(-7), completedAt: daysFromNow(-6), order: 2 },
    { id: 'ms-plaster', name: 'Plastering & skim coat', targetDate: daysFromNow(10), order: 3, description: 'All internal walls ready for paint.' },
    { id: 'ms-carpentry', name: 'Built-in carpentry install', targetDate: daysFromNow(30), order: 4 },
    { id: 'ms-handover', name: 'Handover & defects walk', targetDate: daysFromNow(58), order: 5 },
  ];
  for (const m of milestones) {
    await db.doc(`workspaces/${WID}/projects/pr-bungalow/milestones/${m.id}`).set(m);
  }

  // --- Tasks on the bungalow project ------------------------------------------
  const me = { type: 'user', id: owner.uid, name: 'Dev Owner' };
  const pmAssignee = { type: 'user', id: pm.uid, name: 'Dev Pm' };
  const wong = { type: 'collaborator', id: 'co-wong', name: 'Wong Kam Fai', phone: '+60123002001' };
  const tasks = [
    { id: 't-tiles', title: 'Confirm bathroom tile selection with client', status: 'in_progress', dueDate: daysFromNow(2), assignees: [me], visibleToClient: true },
    { id: 't-permit', title: 'Renew DBKL renovation permit', status: 'todo', dueDate: daysFromNow(-3), assignees: [me], visibleToClient: false },
    { id: 't-wiring-cert', title: 'Collect electrical certification from KF Electrical', status: 'todo', dueDate: daysFromNow(-1), assignees: [me, wong], visibleToClient: false },
    { id: 't-kitchen', title: 'Kitchen island stone top template', status: 'blocked', blockedReason: 'Waiting for client to confirm stone slab choice', dueDate: daysFromNow(6), assignees: [pmAssignee], visibleToClient: true },
    { id: 't-paint', title: 'Schedule painters for level 2', status: 'todo', dueDate: daysFromNow(5), assignees: [me], visibleToClient: false },
    { id: 't-aircond', title: 'Air-cond trunking inspection', status: 'done', completedAt: daysFromNow(-2), dueDate: daysFromNow(-2), assignees: [pmAssignee], visibleToClient: true },
  ];
  for (const [i, t] of tasks.entries()) {
    await db.doc(`workspaces/${WID}/projects/pr-bungalow/tasks/${t.id}`).set({
      description: '', visibleToCollaboratorIds: [], restrictedToDepartments: [],
      sendWhatsapp: false, order: i,
      createdAt: now, updatedAt: now, createdBy: owner.uid,
      ...t,
    });
  }

  process.stdout.write('Design seed complete: 3 clients, 3 collaborators, 5 projects, 5 milestones, 6 tasks.\n');
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
