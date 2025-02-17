import { FC, DragEvent, ChangeEvent } from 'react';
import { CloudArrowUpIcon } from '@heroicons/react/24/outline';

interface UploadAreaProps {
  onUpload: (files: FileList) => void;
  loading: boolean;
}

const ACCEPTED_FILE_TYPES = ['.pdf', '.txt'];

const UploadArea: FC<UploadAreaProps> = ({ onUpload, loading }) => {
  const validateFiles = (files: FileList): boolean => {
    for (let i = 0; i < files.length; i++) {
      const extension = '.' + files[i].name.split('.').pop()?.toLowerCase();
      if (!ACCEPTED_FILE_TYPES.includes(extension)) {
        alert(`Format de fichier non supporté. Formats acceptés: ${ACCEPTED_FILE_TYPES.join(', ')}`);
        return false;
      }
    }
    return true;
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      if (validateFiles(e.dataTransfer.files)) {
        onUpload(e.dataTransfer.files);
      }
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (validateFiles(e.target.files)) {
        onUpload(e.target.files);
      }
    }
  };

  return (
    <div
      className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-gray-400 transition-colors"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={() => document.getElementById('fileInput')?.click()}
    >
      <input
        type="file"
        id="fileInput"
        className="hidden"
        onChange={handleFileInput}
        accept=".pdf,.txt"
        multiple
      />
      <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
      <span className="mt-2 block text-sm font-semibold text-gray-900">
        {loading ? 'Chargement...' : `Glissez-déposez des fichiers (${ACCEPTED_FILE_TYPES.join(', ')}) ou cliquez pour sélectionner`}
      </span>
    </div>
  );
};

export default UploadArea;
