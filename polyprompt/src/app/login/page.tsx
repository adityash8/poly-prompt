'use client'

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Auth } from "@supabase/auth-ui-react";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const supabase = createClientComponentClient();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow">
        <h1 className="text-2xl font-bold text-center mb-6">Login to Poly Prompt</h1>
        <Auth
          supabaseClient={supabase}
          providers={[]}
          magicLink={true}
          view="magic_link"
        />
      </div>
    </div>
  );
}
