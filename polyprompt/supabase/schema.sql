-- Poly Prompt Database Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'team')),
  runs_count INTEGER DEFAULT 0,
  runs_limit INTEGER DEFAULT 50,
  stripe_customer_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Runs table
CREATE TABLE public.runs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'running', 'completed', 'error')),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  models TEXT[] NOT NULL DEFAULT '{}',
  variables JSONB DEFAULT '{}',
  is_public BOOLEAN DEFAULT FALSE,
  share_id TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Evals table (evaluation results)
CREATE TABLE public.evals (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  run_id UUID REFERENCES public.runs(id) ON DELETE CASCADE NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0,
  output TEXT,
  score INTEGER,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Templates table
CREATE TABLE public.templates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  prompt TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  variables JSONB DEFAULT '{}',
  is_featured BOOLEAN DEFAULT FALSE,
  use_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_runs_user_id ON public.runs(user_id);
CREATE INDEX idx_runs_created_at ON public.runs(created_at DESC);
CREATE INDEX idx_runs_share_id ON public.runs(share_id) WHERE share_id IS NOT NULL;
CREATE INDEX idx_evals_run_id ON public.evals(run_id);
CREATE INDEX idx_templates_category ON public.templates(category);
CREATE INDEX idx_templates_featured ON public.templates(is_featured) WHERE is_featured = TRUE;

-- Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Runs policies
CREATE POLICY "Users can view their own runs" ON public.runs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view public runs" ON public.runs
  FOR SELECT USING (is_public = TRUE);

CREATE POLICY "Users can insert their own runs" ON public.runs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own runs" ON public.runs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own runs" ON public.runs
  FOR DELETE USING (auth.uid() = user_id);

-- Evals policies
CREATE POLICY "Users can view evals for their runs" ON public.evals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.runs
      WHERE runs.id = evals.run_id
      AND (runs.user_id = auth.uid() OR runs.is_public = TRUE)
    )
  );

CREATE POLICY "Users can insert evals for their runs" ON public.evals
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.runs
      WHERE runs.id = evals.run_id
      AND runs.user_id = auth.uid()
    )
  );

-- Templates policies
CREATE POLICY "Everyone can view templates" ON public.templates
  FOR SELECT USING (TRUE);

CREATE POLICY "Authenticated users can create templates" ON public.templates
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Functions and triggers

-- Function to handle user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

-- Trigger to create profile on user signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Triggers for updated_at
CREATE TRIGGER handle_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_runs_updated_at
  BEFORE UPDATE ON public.runs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Function to generate share ID
CREATE OR REPLACE FUNCTION public.generate_share_id()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER := 0;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Insert some default templates
INSERT INTO public.templates (title, description, prompt, category, variables, is_featured) VALUES
('Cold Email Outreach', 'Generate personalized cold emails for sales outreach', 'Write a cold email to {{contact_name}} at {{company}} about {{product}}. The email should be:
- Personalized and relevant
- Clear value proposition
- Professional but friendly tone
- Include a clear call-to-action

Contact: {{contact_name}}
Company: {{company}}
Product: {{product}}', 'sales', '{"contact_name": "John Smith", "company": "Acme Corp", "product": "our AI platform"}', TRUE),

('SEO Blog Post', 'Create SEO-optimized blog content', 'Write a comprehensive blog post about {{topic}} that is:
- SEO-optimized for the keyword "{{keyword}}"
- 1500-2000 words
- Includes practical tips and examples
- Has a clear structure with headings
- Engaging and informative tone

Topic: {{topic}}
Target keyword: {{keyword}}
Target audience: {{audience}}', 'content', '{"topic": "AI in marketing", "keyword": "AI marketing tools", "audience": "marketing professionals"}', TRUE),

('Product Description', 'Write compelling product descriptions for e-commerce', 'Create a compelling product description for {{product_name}}:

Product: {{product_name}}
Key features: {{features}}
Target audience: {{target_audience}}
Price point: {{price}}

The description should:
- Highlight key benefits and features
- Address customer pain points
- Include emotional triggers
- Be scannable with bullet points
- End with a strong call-to-action', 'ecommerce', '{"product_name": "Wireless Bluetooth Headphones", "features": "noise cancelling, 30hr battery, premium sound", "target_audience": "music lovers and commuters", "price": "$199"}', TRUE),

('Code Review', 'Get detailed code reviews and suggestions', 'Please review this {{language}} code and provide:
- Code quality assessment
- Performance improvements
- Security considerations
- Best practices recommendations
- Refactoring suggestions

Code:
```{{language}}
{{code}}
```

Focus areas: {{focus_areas}}', 'development', '{"language": "JavaScript", "code": "function calculateTotal(items) { let total = 0; for(let i = 0; i < items.length; i++) { total += items[i].price * items[i].quantity; } return total; }", "focus_areas": "performance and readability"}', TRUE),

('Meeting Summary', 'Summarize meeting notes into actionable items', 'Summarize this meeting and extract:
- Key decisions made
- Action items with owners
- Follow-up tasks
- Important deadlines
- Next steps

Meeting notes:
{{meeting_notes}}

Meeting context: {{context}}
Attendees: {{attendees}}', 'productivity', '{"meeting_notes": "Discussed Q4 goals, budget allocation, and team restructuring", "context": "Quarterly planning meeting", "attendees": "CEO, VP Sales, VP Marketing, Head of Product"}', TRUE);