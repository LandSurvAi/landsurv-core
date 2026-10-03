import React, { forwardRef, useImperativeHandle } from 'react';
import { type CutSheetRow, type CutSheetInfo, type Settings } from '../types.ts';
import * as docx from 'docx';
import { triggerDownload } from '../utils/download.ts';
import { DownloadIcon } from './icons.tsx';

interface CutSheetPanelProps {
  data: CutSheetRow[];
  info: CutSheetInfo;
  setInfo: (info: CutSheetInfo) => void;
  settings: Settings;
}

export interface CutSheetPanelHandles {
    downloadDocx: () => void;
}

const CutSheetPanel: React.ForwardRefRenderFunction<CutSheetPanelHandles, CutSheetPanelProps> = ({ 
  data, 
  info, 
  setInfo,
  settings,
}, ref) => {
  const { coordinatePrecision } = settings;
  const handleInfoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInfo({ ...info, [e.target.name]: e.target.value });
  };

  const handleDownloadDocx = () => {
    if (data.length === 0) return;

    const headerRow = new docx.TableRow({
        children: [
            new docx.TableCell({ children: [new docx.Paragraph({ text: 'Point #', bold: true })] }),
            new docx.TableCell({ children: [new docx.Paragraph({ text: 'Description', bold: true })] }),
            new docx.TableCell({ children: [new docx.Paragraph({ text: 'Design Elev', bold: true })] }),
            new docx.TableCell({ children: [new docx.Paragraph({ text: 'Field Elev', bold: true })] }),
            new docx.TableCell({ children: [new docx.Paragraph({ text: 'Cut / Fill', bold: true })] }),
        ],
    });

    const dataRows = data.map(row => {
        const cutFillText = `${row.cutFill > 0 ? 'C' : 'F'} ${Math.abs(row.cutFill).toFixed(coordinatePrecision)}'`;
        const cutFillColor = row.cutFill > 0 ? 'E74C3C' : '2ECC71'; // Red for Cut, Green for Fill

        return new docx.TableRow({
            children: [
                new docx.TableCell({ children: [new docx.Paragraph(row.pointNumber)] }),
                new docx.TableCell({ children: [new docx.Paragraph(row.description || '')] }),
                new docx.TableCell({ children: [new docx.Paragraph(row.designElevation.toFixed(coordinatePrecision))] }),
                new docx.TableCell({ children: [new docx.Paragraph(row.fieldElevation.toFixed(coordinatePrecision))] }),
                new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: cutFillText, color: cutFillColor })] })] }),
            ],
        });
    });

    const table = new docx.Table({
        rows: [headerRow, ...dataRows],
        width: {
            size: 100,
            type: docx.WidthType.PERCENTAGE,
        },
    });
    
    const doc = new docx.Document({
        sections: [{
            children: [
                new docx.Paragraph({ text: info.companyName, heading: docx.HeadingLevel.HEADING_1 }),
                new docx.Paragraph({ text: `Project: ${info.projectName}` }),
                new docx.Paragraph({ text: `Project No: ${info.projectNumber}` }),
                new docx.Paragraph({ text: `Date: ${info.date}` }),
                new docx.Paragraph({ text: `Crew: ${info.crewChief}` }),
                new docx.Paragraph({ text: '' }), // spacer
                table,
                new docx.Paragraph({ text: '' }), // spacer
                new docx.Paragraph({
                    children: [new docx.TextRun({ text: "Disclaimer: Your requested data is ready for professional review.", size: 16, italic: true })],
                    alignment: docx.AlignmentType.CENTER,
                })
            ],
        }],
    });
    
    const safeProjectName = info.projectName.replace(/[^a-z0-9._-]/gi, '_').toLowerCase();
    docx.Packer.toBlob(doc).then(blob => {
        triggerDownload(blob, `cutsheet_${safeProjectName}.docx`);
    });
  };

  useImperativeHandle(ref, () => ({
      downloadDocx: handleDownloadDocx
  }));

  return (
    <div className="w-full h-full relative bg-gray-900 flex flex-col rounded-md overflow-hidden light-theme:bg-white">
      {/* Header Inputs */}
      <div className="flex-shrink-0 p-4 bg-gray-800/40 backdrop-blur border-b border-gray-700/30 space-y-3 light-theme:bg-gray-50/40 light-theme:border-gray-300/30">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <input type="text" name="companyName" value={info.companyName} onChange={handleInfoChange} className="bg-gray-700 text-sm p-2 rounded-md border border-gray-600 focus:ring-cyan-500 focus:border-cyan-500 light-theme:bg-white light-theme:border-gray-300" />
            <input type="text" name="projectName" value={info.projectName} onChange={handleInfoChange} className="bg-gray-700 text-sm p-2 rounded-md border border-gray-600 focus:ring-cyan-500 focus:border-cyan-500 light-theme:bg-white light-theme:border-gray-300" />
            <input type="text" name="projectNumber" value={info.projectNumber} onChange={handleInfoChange} className="bg-gray-700 text-sm p-2 rounded-md border border-gray-600 focus:ring-cyan-500 focus:border-cyan-500 light-theme:bg-white light-theme:border-gray-300" />
            <input type="text" name="date" value={info.date} onChange={handleInfoChange} className="bg-gray-700 text-sm p-2 rounded-md border border-gray-600 focus:ring-cyan-500 focus:border-cyan-500 light-theme:bg-white light-theme:border-gray-300" />
            <input type="text" name="crewChief" value={info.crewChief} onChange={handleInfoChange} className="bg-gray-700 text-sm p-2 rounded-md border border-gray-600 focus:ring-cyan-500 focus:border-cyan-500 light-theme:bg-white light-theme:border-gray-300" />
        </div>
        <div className="flex justify-end">
            <button onClick={handleDownloadDocx} disabled={data.length === 0} className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors duration-200 bg-cyan-600 text-white hover:bg-cyan-700 disabled:bg-gray-600">
                <DownloadIcon className="w-4 h-4" />
                Download .docx
            </button>
        </div>
      </div>

      {/* Table Area */}
      <div className="flex-grow overflow-auto p-4">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Ask the AI to create a cut sheet to see the data here.
          </div>
        ) : (
          <table className="w-full text-sm text-left text-gray-300 table-auto light-theme:text-gray-600">
            <thead className="text-xs text-gray-300 uppercase bg-gray-700/50 sticky top-0 light-theme:text-gray-500 light-theme:bg-gray-100/50">
              <tr>
                <th scope="col" className="px-6 py-3">Point #</th>
                <th scope="col" className="px-6 py-3">Description</th>
                <th scope="col" className="px-6 py-3 text-right">Design Elev</th>
                <th scope="col" className="px-6 py-3 text-right">Field Elev</th>
                <th scope="col" className="px-6 py-3 text-right">Cut / Fill</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, index) => (
                <tr key={index} className="bg-gray-800/30 border-b border-gray-700 hover:bg-gray-700/50 light-theme:bg-white/30 light-theme:border-gray-200 light-theme:hover:bg-gray-100/50">
                  <td className="px-6 py-3 font-mono font-bold">{row.pointNumber}</td>
                  <td className="px-6 py-3 font-mono">{row.description}</td>
                  <td className="px-6 py-3 font-mono text-right">{row.designElevation.toFixed(coordinatePrecision)}</td>
                  <td className="px-6 py-3 font-mono text-right">{row.fieldElevation.toFixed(coordinatePrecision)}</td>
                  <td className={`px-6 py-3 font-mono font-bold text-right ${row.cutFill > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {row.cutFill > 0 ? 'C' : 'F'} {Math.abs(row.cutFill).toFixed(coordinatePrecision)}'
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default forwardRef(CutSheetPanel);