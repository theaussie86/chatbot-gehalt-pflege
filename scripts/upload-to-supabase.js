
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';


dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName = 'widget-files';
const distFolder = path.join(process.cwd(), 'apps/web/dist');

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadFiles() {
  console.log(`Deploying to Supabase Storage bucket: ${bucketName}`);
  
  if (!fs.existsSync(distFolder)) {
    console.error(`Dist folder not found: ${distFolder}`);
    process.exit(1);
  }

  // Find all files in dist folder
  const files = await glob('**/*', { cwd: distFolder, nodir: true });
  
  console.log(`Found ${files.length} files to upload.`);

  for (const file of files) {
    const filePath = path.join(distFolder, file);
    const fileContent = fs.readFileSync(filePath);
    const contentType = getContentType(file);

    console.log(`Uploading ${file} (${contentType})...`);

    const { error } = await supabase.storage
      .from(bucketName)
      .upload(file, fileContent, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.error(`Error uploading ${file}:`, error.message);
      // Don't exit process, try next file? Or fail build? 
      // transformative: Fail build to ensure consistency.
      process.exit(1); 
    }
  }

  console.log('Deployment complete!');
}

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.avif': 'image/avif',
    '.webp': 'image/webp'
  };
  return map[ext] || 'application/octet-stream';
}

uploadFiles().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
