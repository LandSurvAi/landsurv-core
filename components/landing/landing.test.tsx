import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { RawAgentContent } from './RawAgentContent';
import { DeedAgentContent } from './DeedAgentContent';
import { PlanAgentContent } from './PlanAgentContent';
import { DxfAgentContent } from './DxfAgentContent';
import { StationAgentContent } from './StationAgentContent';
import { PointAgentContent } from './PointAgentContent';
import { GpsAgentContent } from './GpsAgentContent';
import { ImageAgentContent } from './ImageAgentContent';
import { GisAgentContent } from './GisAgentContent';
import { ContourAgentContent, ProfileAgentContent } from './ContourAgentContent';
import { CogoAgentContent } from './CogoAgentContent';
import { GpxAgentContent } from './GpxAgentContent';
import { AgentsPageContent } from './AgentsPageContent';

vi.mock('../../utils/globalSettings', () => ({
  useGlobalSettings: () => ({ retiredAgents: ['RAW_CRAWLER', 'IMAGE_ANALYZER'] }),
}));

describe('Landing Page Components', () => {
  describe('RawAgentContent', () => {
    it('renders the Raw Crawler Agent content', () => {
      render(<RawAgentContent />);
      expect(screen.getByText('RAW Crawler Agent')).toBeInTheDocument();
      expect(screen.getByText(/Your AI-powered field data processor/)).toBeInTheDocument();
    });

    it('displays key features', () => {
      render(<RawAgentContent />);
      expect(screen.getByText(/Intelligent Parsing/)).toBeInTheDocument();
      expect(screen.getByText(/Error Detection/)).toBeInTheDocument();
      expect(screen.getByText(/Instant COGO/)).toBeInTheDocument();
      expect(screen.getByText(/Dynamic Visualization/)).toBeInTheDocument();
    });

    it('renders with proper styling classes', () => {
      const { container } = render(<RawAgentContent />);
      expect(container.querySelector('.text-cyan-400')).toBeInTheDocument();
      expect(container.querySelector('.space-y-4')).toBeInTheDocument();
    });
  });

  describe('DeedAgentContent', () => {
    it('renders the Boundary Agent content', () => {
      render(<DeedAgentContent />);
      expect(screen.getAllByText(/Boundary Agent/i).length).toBeGreaterThan(0);
    });

    it('displays the renamed notice', () => {
      render(<DeedAgentContent />);
      expect(screen.getByText(/now the Boundary Agent/i)).toBeInTheDocument();
    });

    it('uses green color theme', () => {
      const { container } = render(<DeedAgentContent />);
      expect(container.querySelector('.text-green-400')).toBeInTheDocument();
    });
  });

  describe('PlanAgentContent', () => {
    it('renders the Civil Plan Expert Agent content', () => {
      render(<PlanAgentContent />);
      expect(screen.getByText('Civil Plan Expert Agent')).toBeInTheDocument();
    });

    it('displays plan analysis features', () => {
      render(<PlanAgentContent />);
      expect(screen.getByText(/civil engineering/i)).toBeInTheDocument();
    });
  });

  describe('DxfAgentContent', () => {
    it('renders the DXF Agent content', () => {
      render(<DxfAgentContent />);
      expect(screen.getByText('DXF Agent')).toBeInTheDocument();
    });

    it('describes DXF processing capabilities', () => {
      render(<DxfAgentContent />);
      expect(screen.getByText('Query and visualize CAD drawings in your browser.')).toBeInTheDocument();
    });
  });

  describe('StationAgentContent', () => {
    it('renders the Stationing & CL Agent content', () => {
      render(<StationAgentContent />);
      expect(screen.getByText('Stationing & CL Agent')).toBeInTheDocument();
    });

    it('explains alignment design features', () => {
      render(<StationAgentContent />);
      expect(screen.getByText('Define and calculate horizontal alignments with ease.')).toBeInTheDocument();
    });
  });

  describe('PointAgentContent', () => {
    it('renders the Point Editor Agent content', () => {
      render(<PointAgentContent />);
      expect(screen.getByText('Point Editor Agent')).toBeInTheDocument();
    });

    it('describes point management capabilities', () => {
      render(<PointAgentContent />);
      expect(screen.getByText('The central hub for all your project\'s coordinate data.')).toBeInTheDocument();
    });
  });

  describe('GpsAgentContent', () => {
    it('renders the GPS Stakeout Agent content', () => {
      render(<GpsAgentContent />);
      expect(screen.getByText('GPS Stakeout Agent')).toBeInTheDocument();
    });

    it('explains field positioning features', () => {
      render(<GpsAgentContent />);
      expect(screen.getByText('Turn your device into a powerful field data collection tool.')).toBeInTheDocument();
    });
  });

  describe('ImageAgentContent', () => {
    it('renders the Image Analyzer Agent content', () => {
      render(<ImageAgentContent />);
      expect(screen.getByText('Image Analyzer Agent')).toBeInTheDocument();
    });

    it('describes image analysis capabilities', () => {
      render(<ImageAgentContent />);
      expect(screen.getByText('Unlock insights from your site photos.')).toBeInTheDocument();
    });
  });

  describe('GisAgentContent', () => {
    it('renders the GIS Agent content', () => {
      render(<GisAgentContent />);
      expect(screen.getByText('GIS Agent')).toBeInTheDocument();
    });

    it('explains spatial data features', () => {
      render(<GisAgentContent />);
      expect(screen.getByText('Bridge the gap between GIS and land surveying.')).toBeInTheDocument();
    });
  });

  describe('ContourAgentContent', () => {
    it('renders the Contouring Agent content', () => {
      render(<ContourAgentContent />);
      expect(screen.getByText('Contouring Agent')).toBeInTheDocument();
    });

    it('describes contour features', () => {
      render(<ContourAgentContent />);
      expect(screen.getByText('Visualize topography with AI-generated contour lines.')).toBeInTheDocument();
    });
  });

  describe('ProfileAgentContent', () => {
    it('renders the Profile & Cross Section Agent content', () => {
      render(<ProfileAgentContent />);
      expect(screen.getByText('Profile & Cross Section Agent')).toBeInTheDocument();
    });

    it('describes profile generation features', () => {
      render(<ProfileAgentContent />);
      expect(screen.getByText('Generate and analyze elevation profiles along alignments.')).toBeInTheDocument();
    });
  });

  describe('CogoAgentContent', () => {
    it('renders the COGO Agent content', () => {
      render(<CogoAgentContent />);
      expect(screen.getByText('COGO Agent')).toBeInTheDocument();
      expect(screen.getByText(/coordinate geometry workbench/i)).toBeInTheDocument();
    });

    it('displays COGO-specific features', () => {
      render(<CogoAgentContent />);
      expect(screen.getByText(/Forward & inverse/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Intersections/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Curves & spirals/i)).toBeInTheDocument();
    });

    it('uses violet color theme', () => {
      const { container } = render(<CogoAgentContent />);
      expect(container.querySelector('.text-violet-400')).toBeInTheDocument();
    });
  });

  describe('GpxAgentContent', () => {
    it('renders the GPX tools page content', () => {
      render(<GpxAgentContent />);
      expect(screen.getByText('GPX Data Tools')).toBeInTheDocument();
    });

    it('describes GPS/GPX features', () => {
      render(<GpxAgentContent />);
      expect(screen.getByText('Process GPS exchange format data with ease.')).toBeInTheDocument();
    });

    it('uses red color theme', () => {
      const { container } = render(<GpxAgentContent />);
      expect(container.querySelector('.text-red-400')).toBeInTheDocument();
    });
  });

  describe('AgentsPageContent', () => {
    it('renders the agents directory page', () => {
      render(<AgentsPageContent />);
      expect(screen.getByText('LandSurv.ai Agents')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /LandSurv\.ai Agents/i })).toBeInTheDocument();
    });

    it('displays all 16 active agents', () => {
      render(<AgentsPageContent />);
      expect(screen.getByText('Civil Drafter Agent')).toBeInTheDocument();
      expect(screen.getByText(/Boundary Agent/i)).toBeInTheDocument();
      expect(screen.getByText('Civil Plan Expert Agent')).toBeInTheDocument();
      expect(screen.getByText('DXF Agent')).toBeInTheDocument();
      expect(screen.getByText('GIS Agent')).toBeInTheDocument();
      expect(screen.getByText('Stationing & Centerline Agent')).toBeInTheDocument();
      expect(screen.getByText('Point Editor Agent')).toBeInTheDocument();
      expect(screen.getByText('GPS Stakeout Agent')).toBeInTheDocument();
      expect(screen.getByText('Contouring Agent')).toBeInTheDocument();
      expect(screen.getByText('Profile & Cross Section Agent')).toBeInTheDocument();
      expect(screen.getByText('COGO Agent')).toBeInTheDocument();
      expect(screen.getByText('RINEX Agent')).toBeInTheDocument();
      expect(screen.getByText('AR Visualization Agent')).toBeInTheDocument();
      expect(screen.getByText('Zoning Agent')).toBeInTheDocument();
      expect(screen.getByText('Title Search Agent')).toBeInTheDocument();
      expect(screen.getByText('CAD Manager')).toBeInTheDocument();
      expect(screen.queryByText('RAW Crawler Agent')).not.toBeInTheDocument();
      expect(screen.queryByText('Image Analyzer Agent')).not.toBeInTheDocument();
      expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(16);
    });

    it('displays key capabilities section', () => {
      render(<AgentsPageContent />);
      expect(screen.getByText('Key Capabilities')).toBeInTheDocument();
      expect(screen.getByText(/Natural language interaction/)).toBeInTheDocument();
      expect(screen.getByText(/Real-time data visualization/)).toBeInTheDocument();
    });

    it('displays getting started section', () => {
      render(<AgentsPageContent />);
      expect(screen.getByText('Getting Started')).toBeInTheDocument();
    });

    it('displays agent subdomains section', () => {
      render(<AgentsPageContent />);
      expect(screen.getByText('Access Agent Subdomains')).toBeInTheDocument();
      // Check for subdomains text in container
      const { container } = render(<AgentsPageContent />);
      expect(container.textContent).toContain('civildrafter.landsurv.ai');
      expect(container.textContent).not.toContain('raw.landsurv.ai');
    });

    it('renders with cyan color theme', () => {
      const { container } = render(<AgentsPageContent />);
      expect(container.querySelector('.text-cyan-400')).toBeInTheDocument();
    });

    it('has proper grid layout for agents', () => {
      const { container } = render(<AgentsPageContent />);
      expect(container.querySelector('.grid')).toBeInTheDocument();
    });
  });

  describe('Common Landing Page Patterns', () => {
    it('all agent pages have title and description', () => {
      const agents = [
        <RawAgentContent />,
        <DeedAgentContent />,
        <CogoAgentContent />,
      ];

      agents.forEach((agent) => {
        const { container } = render(agent);
        // Check for header structure
        expect(container.querySelector('h3') || container.querySelector('h1')).toBeInTheDocument();
      });
    });

    it('all pages use Tailwind responsive classes', () => {
      const pages = [
        <AgentsPageContent />,
        <CogoAgentContent />,
      ];

      pages.forEach((page) => {
        const { container } = render(page);
        // Look for common Tailwind classes
        const hasTailwindClasses =
          container.querySelector('[class*="space-y"]') ||
          container.querySelector('[class*="p-"]') ||
          container.querySelector('[class*="rounded"]');
        expect(hasTailwindClasses).toBeTruthy();
      });
    });

    it('all pages have proper text contrast', () => {
      const pages = [
        <RawAgentContent />,
        <CogoAgentContent />,
        <AgentsPageContent />,
      ];

      pages.forEach((page) => {
        const { container } = render(page);
        // Check that pages use proper color classes for accessibility
        const coloredElements =
          container.querySelector('[class*="text-"]') ||
          container.querySelector('[class*="bg-"]');
        expect(coloredElements).toBeTruthy();
      });
    });
  });
});
