-- Migration 000010 DOWN: Drop audit log partitions and table

DROP TABLE IF EXISTS audit_logs_default;
DROP TABLE IF EXISTS audit_logs_2026_06;
DROP TABLE IF EXISTS audit_logs_2026_05;
DROP TABLE IF EXISTS audit_logs_2026_04;
DROP TABLE IF EXISTS audit_logs_2026_03;
DROP TABLE IF EXISTS audit_logs_2026_02;
DROP TABLE IF EXISTS audit_logs_2026_01;
DROP TABLE IF EXISTS audit_logs;
