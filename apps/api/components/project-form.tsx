'use client';

import { createProject, updateProject } from '@/app/actions/projects';
import { useActionState } from 'react';
import { useEffect, useState } from 'react';

type Project = {
  id: string;
  name: string | null;
  name: string | null;
  allowed_origins: string[] | null;
  gemini_api_key: string | null;
};

type ProjectFormProps = {
  project?: Project | null;
  onClose: () => void;
};

const initialState = {
  message: '',
  error: '',
};

export default function ProjectForm({ project, onClose }: ProjectFormProps) {
  // @ts-ignore - Types for useActionState might be slightly different depending on React version
  const [state, formAction, isPending] = useActionState(
    project ? updateProject : createProject,
    initialState
  );

  useEffect(() => {
    if (state?.success) {
      onClose();
    }
  }, [state, onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {project ? 'Edit Project' : 'New Project'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form action={formAction} className="p-4 space-y-4">
          {project && <input type="hidden" name="id" value={project.id} />}
          
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Project Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              defaultValue={project?.name || ''}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="My Awesome Chatbot"
            />
          </div>

          <div>
            <label htmlFor="allowed_origins" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Allowed Origins (comma separated)
            </label>
            <input
              type="text"
              id="allowed_origins"
              name="allowed_origins"
              defaultValue={project?.allowed_origins?.join(', ') || ''}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="https://example.com, https://app.example.com"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Leave empty to block all origins (unless using API key server-side).
            </p>
          </div>

          <div>
            <label htmlFor="gemini_api_key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Gemini API Key (Optional)
            </label>
            <input
              type="password"
              id="gemini_api_key"
              name="gemini_api_key"
              defaultValue={project?.gemini_api_key || ''}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="AIzaSy..."
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Your custom Gemini API Key. If left empty, the system default might be used (if configured).
            </p>
          </div>

          {state?.error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-md">
              {state.error}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="mr-3 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Saving...' : 'Save Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
