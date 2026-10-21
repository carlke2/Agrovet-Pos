import dotenv from 'dotenv';
import path from 'path';
import { assertSupabaseDatabase } from './requireSupabase';

dotenv.config({ path: path.resolve(__dirname, '.env') });
assertSupabaseDatabase();
