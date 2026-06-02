// =====================================================
// Supabase Client Configuration — Cooking GPS
// =====================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://rsnzjvcpuwtuwzxbnnic.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_as8qTSEgNWFX9cqTqxODfQ_cKiLBoYe';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =====================================================
// Auth Helpers
// =====================================================

// Get the currently logged-in user
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) console.error('Error getting user:', error);
  return user;
}

// Sign up with email & password
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

// Sign in with email & password
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Sign out
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Listen for auth state changes (login/logout)
export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
}

// =====================================================
// Recipe Helpers (ready for when you add the table)
// =====================================================

// Fetch all public published recipes
export async function getPublicRecipes() {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('is_published', true)
    .eq('is_private', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Fetch the current user's own recipes
export async function getMyRecipes(userId) {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('creator_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Fetch a single recipe by ID
export async function getRecipeById(id) {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// Save (upsert) a recipe
export async function saveRecipe(recipe) {
  const { data, error } = await supabase
    .from('recipes')
    .upsert(recipe)
    .select()
    .single();
  if (error) throw error;
  return data;
}
