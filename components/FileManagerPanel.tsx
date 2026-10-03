import React, { useState, useEffect } from 'react';
import { type SessionFile, type PointList } from '../types';
// FIX: Import GisAgentIcon to display the icon for GeoJSON files.
import { BrainCircuitIcon, CourthouseIcon, DxfIcon, DocumentDuplicateIcon, TableCellsIcon, ChevronDownIcon, ChevronUpIcon, DocumentTextIcon, CameraIcon, EraserIcon, GisAgentIcon, SparklesIcon } from './icons';

interface FileManagerPanelProps {
  rawFile: SessionFile | null;
  deedFile: SessionFile | null;
  dxfFile: SessionFile | null;
  planFiles: SessionFile[] | null;
  imageFiles: SessionFile[] | null;
  // FIX: Add gisFile to the component's props to receive GIS data.
  gisFile: SessionFile | null;
  generatedFiles: SessionFile[];
  pointLists: PointList[];
  onOpenFileInEditor: (fileName: string) => void;
  onDeleteFile: (fileName: string) => void;
  onToggleDxfTraining?: (forTraining: boolean) => void;
}

const FileCard: React.FC<{
  file: SessionFile;
  icon: React.FC<any>;
  fileType: string;
  color: string;
  onEdit: () => void;
  onDelete: () => void;
  isConfirmingDelete: boolean;
  onConfirmCancel: () => void;
  onToggleTraining?: (forTraining: boolean) => void;
}> = ({ file, icon: Icon, fileType, color, onEdit, onDelete, isConfirmingDelete, onConfirmCancel, onToggleTraining }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const textColor = `text-${color}-400`;
  const isTextBased = fileType !== 'DXF' && fileType !== 'Image';
  const isDxf = fileType === 'DXF';

  return (
    <div className={`bg-gray-800/50 p-4 rounded-lg border ${file.forTraining ? 'border-fuchsia-500 ring-1 ring-fuchsia-500/30' : 'border-gray-700'} transition-all duration-300 light-theme:bg-gray-100/50 light-theme:border-gray-300`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative">
            <Icon className={`w-8 h-8 ${textColor} flex-shrink-0`} />
            {file.forTraining && (
              <SparklesIcon className="w-4 h-4 text-fuchsia-400 absolute -top-1 -right-1" />
            )}
          </div>
          <div className="min-w-0">
            <h4 className="font-semibold text-gray-100 light-theme:text-gray-800 truncate" title={file.name}>{file.name}</h4>
            <p className="text-xs text-gray-400">
              {fileType}
              {file.forTraining && <span className="ml-2 text-fuchsia-400 font-semibold">• Training Template</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
            {isTextBased && (
                <button onClick={onEdit} className="p-2 rounded-full hover:bg-gray-700 text-gray-300 hover:text-white transition-colors" title="Edit File">
                    <DocumentTextIcon className="w-5 h-5" />
                </button>
            )}
            <button
                onClick={onDelete}
                onMouseLeave={onConfirmCancel}
                className={`p-2 rounded-full transition-all duration-200 flex items-center justify-center ${isConfirmingDelete ? 'bg-red-500 text-white w-24' : 'text-red-400 hover:bg-red-800 hover:text-red-300'}`}
                title="Delete File"
            >
                {isConfirmingDelete ? <span className="text-xs px-1">Confirm?</span> : <EraserIcon className="w-5 h-5" />}
            </button>
            <button onClick={() => setIsExpanded(p => !p)} className="p-2 rounded-full hover:bg-gray-700 light-theme:hover:bg-gray-200">
                {isExpanded ? <ChevronUpIcon className="w-5 h-5" /> : <ChevronDownIcon className="w-5 h-5" />}
            </button>
        </div>
      </div>
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-gray-700 light-theme:border-gray-300">
          {/* DXF Training Toggle */}
          {isDxf && onToggleTraining && (
            <div className="mb-3 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={file.forTraining || false}
                  onChange={(e) => onToggleTraining(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-fuchsia-500 focus:ring-fuchsia-500 focus:ring-offset-gray-900 cursor-pointer"
                />
                <div className="flex-1">
                  <span className="font-semibold text-fuchsia-400 group-hover:text-fuchsia-300 flex items-center gap-2">
                    <SparklesIcon className="w-4 h-4" />
                    Use as Training Template
                  </span>
                  <p className="text-xs text-gray-400 mt-1">
                    When enabled, the Civil Drafter agent will analyze this DXF's layers, line styles, and drafting conventions to learn how to draw.
                  </p>
                </div>
              </label>
            </div>
          )}
          {file.rasterImageData && Array.isArray(file.rasterImageData) && file.rasterImageData.length > 0 && (
            <div className="mb-2">
              <h5 className="text-xs font-semibold text-gray-400 mb-1">Raster Image Preview (Page 1 of {file.rasterImageData.length})</h5>
              <img src={file.rasterImageData[0]} alt="PDF page 1 preview" className="max-w-full rounded-md border border-gray-600"/>
            </div>
          )}
          <h5 className="text-xs font-semibold text-gray-400 mb-1">Extracted Text Content</h5>
          <pre className="text-xs text-gray-300 bg-gray-900 p-2 rounded-md max-h-48 overflow-auto font-mono light-theme:bg-gray-200 light-theme:text-gray-700">
            <code>{file.content}</code>
          </pre>
        </div>
      )}
    </div>
  );
};

const PointListCard: React.FC<{ 
    list: PointList;
    onEdit: () => void;
}> = ({ list, onEdit }) => {
    return (
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 light-theme:bg-gray-100/50 light-theme:border-gray-300">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <TableCellsIcon className="w-8 h-8 text-yellow-400" />
                    <div>
                        <h4 className="font-semibold text-gray-100 light-theme:text-gray-800">{list.name}</h4>
                        <p className="text-xs text-gray-400">Point List ({list.points.length} points)</p>
                    </div>
                </div>
                 <div className="flex items-center gap-2">
                    <button onClick={onEdit} className="p-2 rounded-full hover:bg-gray-700 text-gray-300 hover:text-white transition-colors" title="Edit Point List">
                        <DocumentTextIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    )
}

const FileManagerPanel: React.FC<FileManagerPanelProps> = ({ rawFile, deedFile, dxfFile, gisFile, planFiles, imageFiles, generatedFiles, pointLists, onOpenFileInEditor, onDeleteFile, onToggleDxfTraining }) => {
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  useEffect(() => {
    if (confirmingDelete) {
        const timer = setTimeout(() => {
            setConfirmingDelete(null);
        }, 3000);
        return () => clearTimeout(timer);
    }
  }, [confirmingDelete]);

  const handleDeleteClick = (fileName: string) => {
      if (confirmingDelete === fileName) {
          onDeleteFile(fileName);
          setConfirmingDelete(null);
      } else {
          setConfirmingDelete(fileName);
      }
  };

  // FIX: Add gisFile to the list of assets to be displayed in the file manager.
  const fileBasedAssets = [
    ...(rawFile ? [{ asset: rawFile, type: 'RAW', icon: BrainCircuitIcon, color: 'cyan' }] : []),
    ...(deedFile ? [{ asset: deedFile, type: 'Deed', icon: CourthouseIcon, color: 'green' }] : []),
    ...(dxfFile ? [{ asset: dxfFile, type: 'DXF', icon: DxfIcon, color: 'indigo' }] : []),
    ...(gisFile ? [{ asset: gisFile, type: 'GIS', icon: GisAgentIcon, color: 'teal' }] : []),
    ...(planFiles || []).map(f => ({ asset: f, type: 'Plan', icon: DocumentDuplicateIcon, color: 'orange' })),
    ...(imageFiles || []).map(f => ({ asset: f, type: 'Image', icon: CameraIcon, color: 'red' })),
  ];
  
  const unsavedPointsList = pointLists.find(l => l.id === 'working');
  const savedPointLists = pointLists.filter(l => l.id !== 'working');

  const hasFiles = fileBasedAssets.length > 0;
  const hasGeneratedFiles = generatedFiles.length > 0;
  const hasUnsavedPoints = unsavedPointsList && unsavedPointsList.points.length > 0;
  const hasSavedPointLists = savedPointLists.length > 0;

  return (
    <div className="w-full h-full bg-gray-900 flex flex-col rounded-md overflow-hidden light-theme:bg-white">
      <header className="flex-shrink-0 p-4 bg-gray-800/40 backdrop-blur border-b border-gray-700/30 light-theme:bg-gray-50/40 light-theme:border-gray-300/30">
        <h3 className="text-xl font-semibold text-gray-300 light-theme:text-gray-700">Session File Manager</h3>
        <p className="text-sm text-gray-400">View all files and data loaded in this session. Use the chat agent for actions like renaming or deleting.</p>
      </header>
      <div className="flex-grow overflow-auto p-4">
        {!hasFiles && !hasUnsavedPoints && !hasSavedPointLists && !hasGeneratedFiles ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            No files or data have been loaded into this session.
          </div>
        ) : (
          <div className="space-y-6">
            {hasUnsavedPoints && unsavedPointsList && (
              <div>
                <h4 className="text-lg font-semibold text-gray-400 mb-2">Unsaved Data</h4>
                <div className="space-y-3">
                  <PointListCard list={unsavedPointsList} onEdit={() => onOpenFileInEditor(unsavedPointsList.name)} />
                </div>
              </div>
            )}
            {hasFiles && (
              <div>
                <h4 className="text-lg font-semibold text-gray-400 mb-2">Source Files</h4>
                <div className="space-y-3">
                    {fileBasedAssets.map(item => (
                      <FileCard 
                        key={item.asset.name} 
                        file={item.asset} 
                        fileType={item.type} 
                        icon={item.icon} 
                        color={item.color} 
                        onEdit={() => onOpenFileInEditor(item.asset.name)}
                        onDelete={() => handleDeleteClick(item.asset.name)}
                        isConfirmingDelete={confirmingDelete === item.asset.name}
                        onConfirmCancel={() => confirmingDelete === item.asset.name && setConfirmingDelete(null)}
                        onToggleTraining={item.type === 'DXF' && onToggleDxfTraining ? onToggleDxfTraining : undefined}
                      />
                    ))}
                </div>
              </div>
            )}
            {hasGeneratedFiles && (
                 <div>
                    <h4 className="text-lg font-semibold text-gray-400 mb-2">Generated Files</h4>
                     <div className="space-y-3">
                        {generatedFiles.map(file => (
                            <FileCard 
                                key={file.name}
                                file={file}
                                fileType={"Generated Text"}
                                icon={DocumentTextIcon}
                                color={"gray"}
                                onEdit={() => onOpenFileInEditor(file.name)}
                                onDelete={() => handleDeleteClick(file.name)}
                                isConfirmingDelete={confirmingDelete === file.name}
                                onConfirmCancel={() => confirmingDelete === file.name && setConfirmingDelete(null)}
                            />
                        ))}
                    </div>
                </div>
            )}
            {hasSavedPointLists && (
                 <div>
                    <h4 className="text-lg font-semibold text-gray-400 mb-2">Saved Point Lists</h4>
                     <div className="space-y-3">
                        {savedPointLists.map(list => (
                            <PointListCard key={list.id} list={list} onEdit={() => onOpenFileInEditor(list.name)} />
                        ))}
                    </div>
                </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileManagerPanel;