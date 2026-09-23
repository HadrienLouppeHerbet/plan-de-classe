'use strict';

/*
 * Configuration Supabase (Project Settings → API sur supabase.com).
 * L'URL et la clé "anon" sont publiques par nature : ce n'est pas leur confidentialité qui protège
 * les données, mais les policies RLS côté serveur (voir supabase/schema.sql). Remplacez les deux
 * valeurs ci-dessous par celles de votre projet.
 */
const SUPABASE_URL = 'https://pwnonzlprshowuwnnndw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3bm9uemxwcnNob3d1d25ubmR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNTk5NDMsImV4cCI6MjEwNTczNTk0M30.0D524Xxxt7NoA4NHxmNZBl82fz0p-9Qrx0Vio3eM8NA';

const Supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
