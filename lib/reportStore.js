// Single entry point for report persistence — dispatches to Firestore when
// auth is on, or to localStorage when running in the temporary local-only
// mode (see lib/appConfig.js). Pages import from here and never care which.
import { AUTH_ENABLED } from './appConfig';
import * as firestore from './firestoreReports';
import * as local from './localReports';

const impl = AUTH_ENABLED ? firestore : local;

export const createReport = impl.createReport;
export const updateReport = impl.updateReport;
export const getReport = impl.getReport;
export const listReports = impl.listReports;
export const deleteReport = impl.deleteReport;
