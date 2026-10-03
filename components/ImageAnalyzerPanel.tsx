import React, { useState } from 'react';
import { type SessionFile } from '../types';
import { XMarkIcon } from './icons';

interface ImageAnalyzerPanelProps {
  imageFiles: SessionFile[] | null;
  onUpdateImageTags: (fileName: string, tags: string[]) => void;
}

const ImageAnalyzerPanel: React.FC<ImageAnalyzerPanelProps> = ({ imageFiles, onUpdateImageTags }) => {
  const [selectedImage, setSelectedImage] = useState<SessionFile | null>(null);
  const [newTag, setNewTag] = useState('');

  const handleCloseViewer = () => {
    setSelectedImage(null);
    setNewTag('');
  };
  
  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTag.trim() && selectedImage) {
      const currentTags = selectedImage.tags || [];
      const tagToAdd = newTag.trim().toLowerCase().replace(/\s+/g, '_');
      if (!currentTags.includes(tagToAdd)) {
        const updatedTags = [...currentTags, tagToAdd];
        onUpdateImageTags(selectedImage.name, updatedTags);
        setSelectedImage({ ...selectedImage, tags: updatedTags });
      }
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (selectedImage) {
      const updatedTags = (selectedImage.tags || []).filter(tag => tag !== tagToRemove);
      onUpdateImageTags(selectedImage.name, updatedTags);
      setSelectedImage({ ...selectedImage, tags: updatedTags });
    }
  };

  return (
    <div className="w-full h-full relative bg-gray-900 flex flex-col rounded-md overflow-hidden light-theme:bg-white">
      <header className="flex-shrink-0 p-4 bg-gray-800/40 backdrop-blur border-b border-gray-700/30 light-theme:bg-gray-50/40 light-theme:border-gray-300/30">
        <h3 className="text-xl font-semibold text-gray-300 light-theme:text-gray-700">Image Gallery</h3>
        <p className="text-sm text-gray-400">View your project's images. Click an image to add or remove tags.</p>
      </header>
      <div className="flex-grow overflow-auto p-4">
        {!imageFiles || imageFiles.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>Upload images using the <span className="font-semibold text-gray-400">Image Analyzer</span> agent to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-6">
            {imageFiles.map((file, index) => (
               <div key={`${file.name}-${index}`} className="flex flex-col gap-1.5">
                <button
                  className="relative aspect-square group overflow-hidden rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  onClick={() => setSelectedImage(file)}
                >
                  <img
                    src={file.fileData}
                    alt={file.name}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </button>
                 <p className="text-xs text-gray-400 truncate text-center" title={file.name}>{file.name}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedImage && (
        <div
          className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={handleCloseViewer}
        >
          <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl max-w-4xl w-full flex flex-col md:flex-row max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex-grow bg-black flex items-center justify-center p-2 rounded-t-lg md:rounded-l-lg md:rounded-r-none">
                <img
                    src={selectedImage.fileData}
                    alt={selectedImage.name}
                    className="block max-w-full max-h-[50vh] md:max-h-[85vh] object-contain"
                />
            </div>
            <div className="w-full md:w-72 flex-shrink-0 p-4 flex flex-col">
                 <header className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-semibold text-red-400">Image Tagger</h3>
                        <p className="text-xs text-gray-400 truncate" title={selectedImage.name}>{selectedImage.name}</p>
                    </div>
                    <button onClick={handleCloseViewer} className="p-2 rounded-full hover:bg-gray-700 -mt-2 -mr-2"><XMarkIcon className="w-5 h-5"/></button>
                </header>
                <div className="flex-grow space-y-3 overflow-y-auto">
                    <h4 className="text-sm font-semibold text-gray-300">Tags:</h4>
                    <div className="flex flex-wrap gap-2">
                        {(selectedImage.tags || []).map(tag => (
                            <div key={tag} className="flex items-center gap-1 bg-gray-700 text-gray-200 text-xs font-medium px-2 py-1 rounded-full">
                                <span>{tag}</span>
                                <button onClick={() => handleRemoveTag(tag)} className="text-gray-400 hover:text-white">
                                    <XMarkIcon className="w-3 h-3"/>
                                </button>
                            </div>
                        ))}
                        {(selectedImage.tags || []).length === 0 && <p className="text-xs text-gray-500">No tags yet.</p>}
                    </div>
                </div>
                 <form onSubmit={handleAddTag} className="mt-4 pt-4 border-t border-gray-700 flex gap-2">
                    <input 
                        type="text" 
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        placeholder="Add a new tag..."
                        className="flex-grow p-2 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-md hover:bg-red-700">Add</button>
                </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageAnalyzerPanel;