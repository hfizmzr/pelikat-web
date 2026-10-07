"use client";

import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import DocumentCapture from "@/components/profile/document-capture";
import { deleteRunnerAccount } from "@/lib/actions/account";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";

export default function RunnerProfilePage() {
  const { user } = useAuth();
  const supabase = createClient();
  const router = useRouter();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    dob: "",
    gender: "",
    t_shirt_size: "",
  });

  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm' | 'deleting'>('idle')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from("runner_profiles")
        .select("*")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (data) {
        setProfile(data);
        setFormData({
          full_name: data.full_name || "",
          phone: data.phone || "",
          dob: data.dob || "",
          gender: data.gender || "",
          t_shirt_size: data.t_shirt_size || "",
        });
      }
      setLoading(false);
    };

    if (user) {
      fetchProfile();
    }
  }, [user, supabase]);

  const handleSave = async () => {
    setSaving(true);

    const { error } = await supabase.from("runner_profiles").upsert({
      user_id: user?.id,
      full_name: formData.full_name,
      phone: formData.phone,
      dob: formData.dob,
      gender: formData.gender,
      t_shirt_size: formData.t_shirt_size,
    }, { onConflict: "user_id" });

    setSaving(false);

    if (!error) {
      router.refresh();
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col w-full min-h-full bg-[#131315] items-center justify-center">
        <span className="material-symbols-outlined text-[32px] text-[#cbc3d7] animate-spin">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-full bg-[#131315]">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-[#131315]/90 backdrop-blur-xl border-b border-[#23232b]">
        <div className="flex items-center h-14 px-4 pt-safe">
          <Link href="/runner" className="w-10 h-10 flex items-center justify-center rounded-full text-[#cbc3d7] active:bg-[#1c1b1d] transition-colors -ml-2">
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </Link>
          <div className="flex-1 flex flex-col items-center mr-8 truncate">
            <h1 className="text-[16px] font-bold text-[#e5e1e4] leading-tight">
              Profile
            </h1>
          </div>
        </div>
      </header>

      <div className="flex flex-col px-5 py-6 gap-6 max-w-sm w-full mx-auto pb-24">
        
        {/* Personal Info */}
        <section className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 overflow-hidden">
          <div className="p-5 border-b border-[#353437]/60">
            <h2 className="text-[16px] font-bold text-[#e5e1e4]">Personal Information</h2>
            <p className="text-[12px] text-[#958ea0]">Your basic details</p>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="full_name" className="text-[12px] font-bold text-[#cbc3d7] ml-1">Full Name</label>
              <input
                id="full_name"
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="w-full h-12 px-4 rounded-xl bg-[#23232b] border border-[#353437] text-[14px] text-[#e5e1e4] focus:outline-none focus:border-[#d0bcff]/50"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="phone" className="text-[12px] font-bold text-[#cbc3d7] ml-1">Phone Number</label>
              <input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full h-12 px-4 rounded-xl bg-[#23232b] border border-[#353437] text-[14px] text-[#e5e1e4] focus:outline-none focus:border-[#d0bcff]/50"
              />
            </div>
            <div className="flex flex-col gap-1.5 opacity-60">
              <label htmlFor="email" className="text-[12px] font-bold text-[#cbc3d7] ml-1">Email</label>
              <input
                id="email"
                type="email"
                value={user?.email || ""}
                disabled
                className="w-full h-12 px-4 rounded-xl bg-[#23232b] border border-[#353437] text-[14px] text-[#e5e1e4]"
              />
            </div>
          </div>
        </section>

        {/* Runner Details */}
        <section className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 overflow-hidden">
          <div className="p-5 border-b border-[#353437]/60">
            <h2 className="text-[16px] font-bold text-[#e5e1e4]">Runner Details</h2>
            <p className="text-[12px] text-[#958ea0]">Information for event registration</p>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="dob" className="text-[12px] font-bold text-[#cbc3d7] ml-1">Date of Birth</label>
              <input
                id="dob"
                type="date"
                value={formData.dob}
                onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                className="w-full h-12 px-4 rounded-xl bg-[#23232b] border border-[#353437] text-[14px] text-[#e5e1e4] focus:outline-none focus:border-[#d0bcff]/50"
                style={{ colorScheme: 'dark' }}
              />
            </div>
            <div className="flex flex-col gap-1.5 relative">
              <label htmlFor="gender" className="text-[12px] font-bold text-[#cbc3d7] ml-1">Gender</label>
              <select
                id="gender"
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                className="w-full h-12 px-4 appearance-none rounded-xl bg-[#23232b] border border-[#353437] text-[14px] text-[#e5e1e4] focus:outline-none focus:border-[#d0bcff]/50"
              >
                <option value="">Select gender</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
              <span className="material-symbols-outlined absolute right-4 top-9 text-[#958ea0] pointer-events-none">expand_more</span>
            </div>
            <div className="flex flex-col gap-1.5 relative">
              <label htmlFor="t_shirt_size" className="text-[12px] font-bold text-[#cbc3d7] ml-1">T-Shirt Size</label>
              <select
                id="t_shirt_size"
                value={formData.t_shirt_size}
                onChange={(e) => setFormData({ ...formData, t_shirt_size: e.target.value })}
                className="w-full h-12 px-4 appearance-none rounded-xl bg-[#23232b] border border-[#353437] text-[14px] text-[#e5e1e4] focus:outline-none focus:border-[#d0bcff]/50"
              >
                <option value="">Select size</option>
                <option value="XS">XS</option>
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="L">L</option>
                <option value="XL">XL</option>
                <option value="XXL">XXL</option>
              </select>
              <span className="material-symbols-outlined absolute right-4 top-9 text-[#958ea0] pointer-events-none">expand_more</span>
            </div>
          </div>
        </section>

        {/* PDPA */}
        <section className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 overflow-hidden p-5">
          <h2 className="text-[16px] font-bold text-[#e5e1e4] mb-1">PDPA Consent</h2>
          <div className="flex items-start gap-3 mt-4">
            <div className="pt-1">
              <input
                type="checkbox"
                id="pdpa"
                checked={profile?.pdpa_agreed || false}
                onChange={(e) => {
                  const checked = e.target.checked
                  setProfile({ ...profile, pdpa_agreed: checked })
                  supabase
                    .from("runner_profiles")
                    .upsert(
                      { user_id: user?.id, pdpa_agreed: checked },
                      { onConflict: "user_id" },
                    )
                }}
                className="w-5 h-5 rounded border-[#353437] bg-[#23232b] text-[#d0bcff] focus:ring-[#d0bcff]/50"
              />
            </div>
            <label htmlFor="pdpa" className="text-[13px] text-[#cbc3d7] leading-relaxed">
              I consent to the collection and processing of my personal data in accordance with PDPA
            </label>
          </div>
        </section>

        <DocumentCapture
          userId={user?.id || ""}
          currentDocument={{
            path: profile?.ic_document_path || null,
            mime: profile?.ic_document_mime || null,
          }}
        />

        <button 
          onClick={handleSave} 
          disabled={saving}
          className="w-full py-4 mt-2 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[15px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50 shadow-lg shadow-[#d0bcff]/10"
        >
          {saving ? (
            <>
              <span className="material-symbols-outlined text-[20px] animate-spin">progress_activity</span>
              Saving...
            </>
          ) : (
            'Save Profile'
          )}
        </button>

        {/* Danger Zone */}
        <section className="bg-[#1c1b1d] rounded-2xl border border-[#ffb4ab]/30 overflow-hidden mt-8">
          <div className="p-5 border-b border-[#ffb4ab]/20 bg-[#ffb4ab]/5">
            <h2 className="text-[16px] font-bold text-[#ffb4ab] flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">warning</span>
              Danger Zone
            </h2>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <p className="text-[12px] text-[#cbc3d7] leading-relaxed">
              Permanently delete your account and all personal data. This action cannot be undone.
            </p>

            {deleteStep === 'idle' && (
              <button 
                onClick={() => setDeleteStep('confirm')}
                className="py-3 px-4 rounded-xl bg-[#ffb4ab]/10 text-[#ffb4ab] text-[13px] font-bold border border-[#ffb4ab]/20 active:bg-[#ffb4ab]/20 transition-colors"
              >
                Delete My Account
              </button>
            )}

            {deleteStep === 'confirm' && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="delete-confirm" className="text-[12px] font-bold text-[#ffb4ab] ml-1">
                    Type <span className="font-extrabold">DELETE</span> to confirm
                  </label>
                  <input
                    id="delete-confirm"
                    type="text"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder="DELETE"
                    className="w-full h-12 px-4 rounded-xl bg-[#23232b] border border-[#ffb4ab]/30 text-[14px] text-[#e5e1e4] focus:outline-none focus:border-[#ffb4ab]"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={deleteConfirm !== 'DELETE'}
                    onClick={async () => {
                      setDeleteStep('deleting')
                      setDeleteError(null)
                      try {
                        await deleteRunnerAccount()
                      } catch (err) {
                        setDeleteError(err instanceof Error ? err.message : 'Deletion failed')
                        setDeleteStep('idle')
                      }
                    }}
                    className="flex-[2] py-3 rounded-xl bg-[#ffb4ab] text-[#690005] text-[13px] font-bold active:scale-95 transition-transform disabled:opacity-50"
                  >
                    Confirm Delete
                  </button>
                  <button
                    onClick={() => {
                      setDeleteStep('idle')
                      setDeleteConfirm('')
                    }}
                    className="flex-1 py-3 rounded-xl bg-[#2a2a2c] text-[#e5e1e4] text-[13px] font-bold active:scale-95 transition-transform"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {deleteStep === 'deleting' && (
              <div className="flex items-center justify-center gap-2 text-[13px] text-[#ffb4ab] font-bold py-3 bg-[#ffb4ab]/10 rounded-xl">
                <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                Deleting...
              </div>
            )}

            {deleteError && (
              <div className="p-3 rounded-lg bg-[#ffb4ab]/10 border border-[#ffb4ab]/20 text-[#ffb4ab] text-[12px] flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">error</span>
                {deleteError}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
