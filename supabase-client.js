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

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) console.error('Error getting user:', error);
  return user;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
}

// =====================================================
// Recipe Helpers — mapped to actual DB schema
//
// Actual columns:
//   id, device_id, title, creator, duration,
//   loops, ingredients, steps, text_overlays,
//   videos, bundle_mode, private_recipe,
//   created_at, updated_at, is_published,
//   shared_on_profile, is_draft, temp_recipe, video_url
// =====================================================

// Fetch all public published recipes for Discover feed
export async function getPublicRecipes() {
  const { data, error } = await supabase
    .from('recipes')
    .select('id, title, creator, duration, loops, steps, ingredients, video_url, is_published, shared_on_profile, created_at')
    .eq('is_published', true)
    .eq('private_recipe', false)
    .eq('is_draft', false)
    .eq('temp_recipe', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Fetch recipes shared on a user's public profile
export async function getProfileRecipes(creator) {
  const { data, error } = await supabase
    .from('recipes')
    .select('id, title, creator, duration, steps, video_url, created_at')
    .eq('creator', creator)
    .eq('shared_on_profile', true)
    .eq('is_draft', false)
    .eq('temp_recipe', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Fetch all recipes by device_id (anonymous user's recipes)
export async function getMyRecipesByDevice(deviceId) {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('device_id', deviceId)
    .eq('is_draft', false)
    .eq('temp_recipe', false)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
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
  const payload = {
    ...recipe,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('recipes')
    .upsert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Search recipes by title
export async function searchRecipes(query) {
  const { data, error } = await supabase
    .from('recipes')
    .select('id, title, creator, duration, steps, video_url, created_at')
    .ilike('title', `%${query}%`)
    .eq('is_published', true)
    .eq('private_recipe', false)
    .eq('is_draft', false)
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

// =====================================================
// Device ID Helper (for anonymous users)
// =====================================================
export function getOrCreateDeviceId() {
  let id = localStorage.getItem('cooking_gps_device_id');
  if (!id) {
    id = 'device_' + Math.random().toString(36).slice(2, 11);
    localStorage.setItem('cooking_gps_device_id', id);
  }
  return id;
}

// =====================================================
// Video Upload — Supabase Storage
// =====================================================

// Upload a video file to the 'videos' bucket
// Returns the public URL of the uploaded video
export async function uploadVideo(file, userEmail) {
  const ext = file.name.split('.').pop().toLowerCase();
  const folder = (userEmail || 'anon').replace(/[@.]/g, '_');
  const filename = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;

  const { data, error } = await supabase.storage
    .from('videos')
    .upload(filename, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from('videos')
    .getPublicUrl(filename);

  return publicUrl;
}

// Create a brand new recipe record
export async function createRecipe(recipe) {
  const id = 'cook_' + Math.random().toString(36).slice(2, 10);
  const isDraft = recipe.is_draft ?? false;
  const payload = {
    id,
    title:             recipe.title || 'Untitled Recipe',
    creator:           recipe.creator || 'you',
    duration:          recipe.duration || 0,
    loops:             recipe.loops || [],
    steps:             recipe.steps || [],
    ingredients:       recipe.ingredients || [],
    video_url:         recipe.video_url || null,
    private_recipe:    isDraft ? true : (recipe.private_recipe ?? true),
    is_published:      isDraft ? false : (recipe.is_published ?? false),
    shared_on_profile: isDraft ? false : (recipe.shared_on_profile ?? false),
    is_draft:          isDraft,
    temp_recipe:       false,
    created_at:        new Date().toISOString(),
    updated_at:        new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('recipes')
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// =====================================================
// My Page — fetch ALL recipes for the logged-in user
// (drafts + private + public — everything they've made)
// =====================================================
export async function getUserAllRecipes(creator) {
  const { data, error } = await supabase
    .from('recipes')
    .select('id, title, creator, duration, steps, video_url, is_published, private_recipe, is_draft, shared_on_profile, created_at, updated_at')
    .eq('creator', creator)
    .eq('temp_recipe', false)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// =====================================================
// Update a recipe (publish/unpublish, edit fields)
// =====================================================
export async function updateRecipe(id, updates) {
  const { data, error } = await supabase
    .from('recipes')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// =====================================================
// Phase 7 — User Loop Customizations
// =====================================================

export async function getUserLoops(userId, recipeId) {
  const { data, error } = await supabase
    .from('user_loops')
    .select('loops')
    .eq('user_id', userId)
    .eq('recipe_id', recipeId)
    .single();
  if (error) return null; // table may not exist yet
  return data?.loops ?? null;
}

export async function saveUserLoops(userId, recipeId, loops) {
  const { error } = await supabase
    .from('user_loops')
    .upsert({ user_id: userId, recipe_id: recipeId, loops, updated_at: new Date().toISOString() },
             { onConflict: 'user_id,recipe_id' });
  if (error) throw error;
}

// =====================================================
// Phase 8b — Folders
// =====================================================

export async function getFolders(userId) {
  const { data, error } = await supabase
    .from('recipe_folders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at');
  if (error) return [];
  return data ?? [];
}

export async function createFolder(userId, name, color = '#4a90d9') {
  const { data, error } = await supabase
    .from('recipe_folders')
    .insert({ user_id: userId, name, color })
    .select().single();
  if (error) throw error;
  return data;
}

export async function assignRecipeToFolder(recipeId, folderId) {
  const { error } = await supabase
    .from('recipes')
    .update({ folder_id: folderId })
    .eq('id', recipeId);
  if (error) throw error;
}

// =====================================================
// Phase 8c — Translation Cache
// =====================================================

export async function getTranslation(recipeId, language) {
  const { data, error } = await supabase
    .from('recipe_translations')
    .select('steps, ingredients')
    .eq('recipe_id', recipeId)
    .eq('language', language)
    .single();
  if (error) return null;
  return data;
}

export async function saveTranslation(recipeId, language, steps, ingredients) {
  const { error } = await supabase
    .from('recipe_translations')
    .upsert({ recipe_id: recipeId, language, steps, ingredients },
             { onConflict: 'recipe_id,language' });
  if (error) throw error;
}
