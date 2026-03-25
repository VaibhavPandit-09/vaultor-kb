import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Lock, Unlock, UploadCloud } from 'lucide-react';
import AppModal from '../components/modals/AppModal';

export default function AuthPage() {
  const [isSetup, setIsSetup] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const [isRestoring, setIsRestoring] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [restoreSuccessOpen, setRestoreSuccessOpen] = useState(false);

  useEffect(() => {
    api.get('/auth/status')
      .then(res => setIsSetup(res.data.isSetup))
      .catch((err) => {
         console.error('Failed to get auth status', err);
         setIsSetup(false);
      });
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setImportFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setError('');
    
    try {
      if (!isSetup) {
        if (isRestoring) {
          if (!importFile) {
             setError('Please select a backup file (.bin)');
             return;
          }
          const formData = new FormData();
          formData.append('file', importFile);
          formData.append('password', password);
          await api.post('/import', formData);
          setRestoreSuccessOpen(true);
          setTimeout(() => window.location.reload(), 2000);
          return;
        }

        await api.post('/auth/setup', { password });
        setIsSetup(true);
        setPassword('');
      } else {
        const { data } = await api.post('/auth/login', { password });
        localStorage.setItem('vaultor_auth_token', data.token);
        navigate('/');
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError('Incorrect master password');
      } else {
        setError(err.response?.data?.message || err.response?.data || 'An error occurred connecting to the backend');
      }
    }
  };

  if (isSetup === null) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-background">
             <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          </div>
      );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground transition-colors duration-200">
      <AppModal
        open={restoreSuccessOpen}
        onClose={() => setRestoreSuccessOpen(false)}
        title="Vault Restored"
        description="Your encrypted vault was restored successfully. The app will refresh in a moment."
        footer={
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Refresh Now
          </button>
        }
      >
        <p className="text-sm text-slate-500">
          Vaultor is restarting the backend so your restored data can be loaded safely.
        </p>
      </AppModal>
      <div className="max-w-md w-full p-8 bg-card rounded-2xl shadow-xl border border-border">
        <div className="flex justify-center mb-8">
          <div className="p-4 bg-primary/10 rounded-full text-primary shadow-inner">
            {!isSetup ? <Unlock size={32} /> : <Lock size={32} />}
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center mb-6 tracking-tight">
          {!isSetup ? (isRestoring ? 'Restore Vault' : 'Setup Master Password') : 'Unlock Vaultor'}
        </h2>
        
        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm text-center">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {!isSetup && isRestoring && (
             <div>
               <button 
                 type="button"
                 onClick={() => importInputRef.current?.click()}
                 className={`w-full p-4 border border-dashed rounded-lg flex items-center justify-center text-sm transition-colors ${importFile ? 'border-primary bg-primary/5 text-primary' : 'border-border text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
               >
                 <UploadCloud size={18} className="mr-2" /> 
                 {importFile ? importFile.name : 'Select Encrypted Backup (.bin)'}
               </button>
               <input type="file" ref={importInputRef} onChange={handleFileSelect} className="hidden" accept=".bin,.zip" />
             </div>
          )}

          <div>
             <input 
               type="password" 
               placeholder={!isSetup && isRestoring ? "Backup's Master Password" : "Master Password"}
               className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
               value={password}
               onChange={e => setPassword(e.target.value)}
               required
               autoFocus
             />
             {!isSetup && !isRestoring && (
               <p className="text-[11px] text-center mt-3 text-slate-500 font-medium tracking-wide text-red-400/90 leading-tight">
                 WARNING: This password secures your vault locally. It cannot be recovered in v1 if lost.
               </p>
             )}
          </div>
          
          <button 
             type="submit" 
             className="w-full bg-primary text-primary-foreground py-3 rounded-lg font-medium hover:bg-primary/90 hover:shadow-md transition-all active:scale-[0.98]"
          >
            {isSetup ? 'Unlock' : (isRestoring ? 'Decrypt & Restore' : 'Initialize Vault')}
          </button>
        </form>

        {!isSetup && (
           <div className="mt-6 text-center">
             <button 
               onClick={() => { setIsRestoring(!isRestoring); setError(''); setPassword(''); }}
               className="text-sm text-slate-500 hover:text-primary transition-colors font-medium"
             >
               {isRestoring ? 'Create new vault instead' : 'Import an existing vault instead'}
             </button>
           </div>
        )}
      </div>
    </div>
  );
}
