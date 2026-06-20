-- 0016_push_templates_category.sql
--
-- Streak-Saver (2026-06-20): Push-Templates bekommen eine Kategorie, damit der
-- abendliche Streak-Saver-Job (19:00 Berlin) NUR aus Streak-Templates waehlt
-- und der taegliche 08:00-Broadcast NUR aus 'daily'-Templates. Bestand =
-- 'daily' (Default), sodass der bestehende Tages-Push unveraendert bleibt.
ALTER TABLE push_templates ADD COLUMN category TEXT NOT NULL DEFAULT 'daily';
