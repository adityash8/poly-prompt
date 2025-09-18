'use client'

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Zap } from "lucide-react";

export default function LoginPage() {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const supabase = createClientComponentClient();

  useEffect(() => {
    setMounted(true);

    // Track login page view
    const trackLoginView = async () => {
      try {
        const { growthos } = await import('@/lib/growthos.js')
        growthos.track('login_page_view', {
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        console.error('Failed to track login view:', error)
      }
    }
    
    trackLoginView()

    // Check if user is already logged in
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/runs');
      }
    };

    checkUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        router.push('/runs');
      }
    });

    return () => subscription.unsubscribe();
  }, [router, supabase]);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="absolute top-4 left-4">
        <Link href="/" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
      </div>

      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="w-full max-w-md">
          {/* Logo and title */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Zap className="h-8 w-8 text-blue-600" />
              <h1 className="text-3xl font-bold text-gray-900">Poly Prompt</h1>
            </div>
            <p className="text-gray-600">
              Sign in to compare prompts across multiple LLMs
            </p>
          </div>

          {/* Auth form */}
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 text-center">Welcome back</h2>
              <p className="text-gray-500 text-center mt-1">Enter your email to sign in</p>
            </div>

            <Auth
              supabaseClient={supabase}
              appearance={{
                theme: ThemeSupa,
                variables: {
                  default: {
                    colors: {
                      brand: '#2563eb',
                      brandAccent: '#1d4ed8',
                    },
                    radii: {
                      borderRadiusButton: '0.5rem',
                      buttonBorderRadius: '0.5rem',
                      inputBorderRadius: '0.5rem',
                    },
                  },
                },
                className: {
                  container: 'space-y-4',
                  button: 'w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium',
                  input: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                  label: 'block text-sm font-medium text-gray-700 mb-2',
                  message: 'text-sm text-center mt-4',
                },
              }}
              providers={[]}
              magicLink={true}
              view="magic_link"
              redirectTo={`${window.location.origin}/auth/callback`}
            />

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500">
                Don&apos;t have an account? Signing in will create one automatically.
              </p>
            </div>
          </div>

          {/* Features preview */}
          <div className="mt-8 text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-4">What you&apos;ll get:</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>50 free runs per month</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Compare across 8+ LLM models</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Save and organize your runs</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
