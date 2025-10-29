import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Theme, Project, UploadedPhoto, ProjectPage, PagePhoto } from "@shared/schema";
import { 
  Upload, 
  Sparkles, 
  Move, 
  RotateCw,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Eye,
  Save,
  X,
  Plus,
  Trash2,
  Grid3x3,
  LayoutGrid,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PhotobookPreview } from "@/components/PhotobookPreview";

export default function Create() {
  const [, navigate] = useLocation();
  const { toast} = useToast();
  
  const urlParams = new URLSearchParams(window.location.search);
  const existingProjectId = urlParams.get("projectId");
  const urlThemeId = urlParams.get("themeId");
  
  const [projectId, setProjectId] = useState<string | null>(existingProjectId);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedMode, setSelectedMode] = useState<"quick" | "advanced">("quick");
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [draggedPhoto, setDraggedPhoto] = useState<UploadedPhoto | null>(null);
  const [canvasDropActive, setCanvasDropActive] = useState(false);
  const [show3DPreview, setShow3DPreview] = useState(false);

  // Fetch existing project if projectId exists
  const { data: existingProject } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/projects/${projectId}`);
      return response.json();
    },
    enabled: !!projectId,
  });

  // Derive themeId from existing project or URL
  const themeId = existingProject?.themeId || urlThemeId;

  // Fetch theme if themeId is provided
  const { data: theme } = useQuery<Theme>({
    queryKey: ["/api/themes", themeId],
    queryFn: async () => {
      const response = await fetch(`/api/themes/${themeId}`);
      if (!response.ok) throw new Error("Failed to fetch theme");
      return response.json();
    },
    enabled: !!themeId,
  });

  // Update project name from loaded project
  useEffect(() => {
    if (existingProject && !projectName) {
      setProjectName(existingProject.name);
    }
  }, [existingProject, projectName]);

  // Query pages for this project
  const { data: pages = [] } = useQuery<ProjectPage[]>({
    queryKey: ["/api/projects", projectId, "pages"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/projects/${projectId}/pages`);
      return response.json();
    },
    enabled: !!projectId,
  });

  // Get current page
  const currentPageData = pages.find(p => p.pageNumber === currentPage);

  // Query photos on current page
  const { data: placedPhotos = [] } = useQuery<PagePhoto[]>({
    queryKey: ["/api/pages", currentPageData?.id, "photos"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/pages/${currentPageData?.id}/photos`);
      return response.json();
    },
    enabled: !!currentPageData?.id,
  });

  // Query all page photos for 3D preview
  const { data: allPagePhotos = {} } = useQuery<Record<string, PagePhoto[]>>({
    queryKey: ["/api/projects", projectId, "all-photos"],
    queryFn: async () => {
      const photosByPage: Record<string, PagePhoto[]> = {};
      for (const page of pages) {
        const response = await apiRequest("GET", `/api/pages/${page.id}/photos`);
        const photos = await response.json();
        photosByPage[page.id] = photos;
      }
      return photosByPage;
    },
    enabled: !!projectId && pages.length > 0 && show3DPreview,
  });

  // Create default page if none exist
  useEffect(() => {
    const createDefaultPage = async () => {
      if (projectId && pages.length === 0) {
        try {
          await apiRequest("POST", `/api/projects/${projectId}/pages`, {
            projectId,
            pageNumber: 1,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "pages"] });
        } catch (error) {
          console.error("Failed to create default page:", error);
        }
      }
    };
    createDefaultPage();
  }, [projectId, pages.length]);

  // Create project mutation
  const createProjectMutation = useMutation({
    mutationFn: async (data: { name: string; themeId?: string }) => {
      const response = await apiRequest("POST", "/api/projects", data);
      return response.json();
    },
    onSuccess: (data: Project) => {
      setProjectId(data.id);
      const params = new URLSearchParams();
      params.set("projectId", data.id);
      if (data.themeId) {
        params.set("themeId", data.themeId);
      }
      navigate(`/create?${params.toString()}`);
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Project created",
        description: "Your photobook project has been created successfully.",
      });
    },
  });

  // Show name dialog when component mounts (only if no existing project)
  useEffect(() => {
    if (!projectId && !showNameDialog) {
      setShowNameDialog(true);
    }
  }, [projectId, showNameDialog]);

  const handleCreateProject = () => {
    if (!projectName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a project name",
        variant: "destructive",
      });
      return;
    }
    createProjectMutation.mutate({
      name: projectName,
      themeId: urlThemeId || undefined,
    });
    setShowNameDialog(false);
  };

  // Query uploaded photos for this project
  const { data: uploadedPhotos = [] } = useQuery<UploadedPhoto[]>({
    queryKey: ["/api/projects", projectId, "uploads"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/projects/${projectId}/uploads`);
      return response.json();
    },
    enabled: !!projectId,
  });

  // Upload photos mutation
  const uploadPhotoMutation = useMutation({
    mutationFn: async (file: File) => {
      const reader = new FileReader();
      return new Promise<UploadedPhoto>((resolve, reject) => {
        reader.onload = async () => {
          const response = await apiRequest("POST", "/api/uploads", {
            projectId,
            url: reader.result as string,
            originalFilename: file.name,
          });
          resolve(await response.json());
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "uploads"] });
    },
  });

  const handleImageUpload = useCallback(async (files: FileList | null) => {
    if (!files || !projectId) return;
    
    const uploadPromises = Array.from(files).map((file) => 
      uploadPhotoMutation.mutateAsync(file)
    );
    
    try {
      await Promise.all(uploadPromises);
      toast({
        title: "Photos uploaded",
        description: `${files.length} photo(s) added to your library`,
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Some photos failed to upload",
        variant: "destructive",
      });
    }
  }, [projectId, uploadPhotoMutation, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleImageUpload(e.dataTransfer.files);
    }
  }, [handleImageUpload]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleAutoLayout = async () => {
    if (!projectId || !currentPageData) {
      toast({
        title: "Error",
        description: "Please create a page first",
        variant: "destructive",
      });
      return;
    }

    // Auto-arrange photos in a grid
    const photosPerRow = 3;
    const gridSpacing = 20;
    const photoWidth = 200;
    const photoHeight = 200;

    for (let i = 0; i < uploadedPhotos.length; i++) {
      const row = Math.floor(i / photosPerRow);
      const col = i % photosPerRow;
      
      await apiRequest("POST", `/api/pages/${currentPageData.id}/photos`, {
        photoUrl: uploadedPhotos[i].url,
        x: col * (photoWidth + gridSpacing) + 50,
        y: row * (photoHeight + gridSpacing) + 50,
        width: photoWidth,
        height: photoHeight,
        rotation: 0,
        zIndex: i,
      });
    }

    queryClient.invalidateQueries({ queryKey: ["/api/pages", currentPageData.id, "photos"] });
    toast({
      title: "Auto-layout applied",
      description: "AI has automatically arranged your photos",
    });
  };

  // Photo drag handlers
  const handlePhotoDragStart = (e: React.DragEvent, photo: UploadedPhoto) => {
    setDraggedPhoto(photo);
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("photoId", photo.id);
  };

  const handlePhotoDragEnd = () => {
    setDraggedPhoto(null);
    setCanvasDropActive(false);
  };

  // Canvas drop handlers
  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setCanvasDropActive(true);
  };

  const handleCanvasDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setCanvasDropActive(false);
  };

  const handleCanvasDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setCanvasDropActive(false);

    if (!draggedPhoto || !currentPageData) {
      toast({
        title: "Error",
        description: "Please select a valid photo and page",
        variant: "destructive",
      });
      return;
    }

    // Get canvas bounds
    const canvas = e.currentTarget.getBoundingClientRect();
    
    // Calculate position relative to canvas
    let x = e.clientX - canvas.left;
    let y = e.clientY - canvas.top;

    // Snap to grid (20px grid)
    const gridSize = 20;
    x = Math.round(x / gridSize) * gridSize;
    y = Math.round(y / gridSize) * gridSize;

    // Default photo size
    const defaultWidth = 200;
    const defaultHeight = 200;

    try {
      await apiRequest("POST", `/api/pages/${currentPageData.id}/photos`, {
        photoUrl: draggedPhoto.url,
        x,
        y,
        width: defaultWidth,
        height: defaultHeight,
        rotation: 0,
        zIndex: placedPhotos.length,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/pages", currentPageData.id, "photos"] });
      
      toast({
        title: "Photo placed",
        description: "Your photo has been added to the page.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to place photo on page",
        variant: "destructive",
      });
    }

    setDraggedPhoto(null);
  };

  const handleSave = () => {
    toast({
      title: "Project saved",
      description: "Your changes have been saved",
    });
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Name Dialog */}
      <Dialog open={showNameDialog} onOpenChange={setShowNameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Name Your Photobook</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              placeholder="e.g., Summer Vacation 2024"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              data-testid="input-project-name"
            />
            <div className="flex gap-2 justify-end">
              <Button 
                variant="outline" 
                onClick={() => navigate("/")}
                data-testid="button-cancel-create"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleCreateProject}
                disabled={createProjectMutation.isPending}
                data-testid="button-confirm-create"
              >
                {createProjectMutation.isPending ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Top Toolbar */}
      <div className="border-b border-border bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="font-semibold" data-testid="text-project-name">
              {existingProject?.name || projectName || "Untitled Project"}
            </h1>
            <p className="text-xs text-muted-foreground" data-testid="text-theme-name">
              {theme?.name || "Blank Canvas"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Tabs value={selectedMode} onValueChange={(v) => setSelectedMode(v as "quick" | "advanced")}>
            <TabsList>
              <TabsTrigger value="quick" data-testid="tab-quick-start">
                <Sparkles className="h-4 w-4 mr-2" />
                Quick Start
              </TabsTrigger>
              <TabsTrigger value="advanced" data-testid="tab-advanced">
                <LayoutGrid className="h-4 w-4 mr-2" />
                Advanced
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
          <Button 
            variant="outline" 
            onClick={() => setShowPreview(true)}
            data-testid="button-3d-preview"
          >
            <Eye className="h-4 w-4 mr-2" />
            3D Preview
          </Button>
          <Button onClick={handleSave} data-testid="button-save">
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Photo Library */}
        <div className="w-80 border-r border-border bg-card overflow-y-auto">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold mb-4" data-testid="text-photo-library">Photo Library</h3>
            
            <label htmlFor="photo-upload" className="cursor-pointer">
              <div 
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragActive 
                    ? "border-primary bg-primary/10" 
                    : "border-border hover:border-primary hover:bg-accent/5"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium mb-1" data-testid="text-upload-prompt">
                  Upload Photos
                </p>
                <p className="text-xs text-muted-foreground">
                  Drag & drop or click to browse
                </p>
              </div>
              <input
                id="photo-upload"
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => handleImageUpload(e.target.files)}
                data-testid="input-photo-upload"
              />
            </label>
          </div>

          <div className="p-4">
            {uploadPhotoMutation.isPending && (
              <div className="mb-4 text-sm text-muted-foreground text-center">
                Uploading photos...
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {uploadedPhotos.map((photo) => (
                <div 
                  key={photo.id}
                  className="relative group cursor-move"
                  draggable={selectedMode === "advanced"}
                  onDragStart={(e) => handlePhotoDragStart(e, photo)}
                  onDragEnd={handlePhotoDragEnd}
                  onClick={() => setSelectedPhotoId(photo.id)}
                  data-testid={`img-uploaded-${photo.id}`}
                >
                  <img 
                    src={photo.url}
                    alt={photo.originalFilename}
                    className="w-full aspect-square object-cover rounded-lg border border-border pointer-events-none"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await apiRequest("DELETE", `/api/uploads/${photo.id}`);
                        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "uploads"] });
                      }}
                      data-testid={`button-delete-${photo.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  {selectedMode === "advanced" && (
                    <div className="absolute top-1 right-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded">
                      <Move className="h-3 w-3" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Center Canvas */}
        <div className="flex-1 bg-muted overflow-auto">
          <div className="min-h-full flex items-center justify-center p-8">
            {selectedMode === "quick" ? (
              <div className="max-w-4xl w-full">
                <Card className="bg-white p-12 shadow-lg" data-testid="canvas-quick-start">
                  <div className="text-center mb-8">
                    <Sparkles className="h-12 w-12 mx-auto mb-4 text-primary" />
                    <h2 className="text-2xl font-bold mb-2">Quick Start Mode</h2>
                    <p className="text-muted-foreground">
                      Upload your photos and let AI create the perfect layout
                    </p>
                  </div>

                  {uploadedPhotos.length === 0 ? (
                    <div className="border-2 border-dashed border-border rounded-lg p-16 text-center">
                      <p className="text-muted-foreground">
                        Upload photos to get started
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-4 mb-6">
                        {uploadedPhotos.slice(0, 9).map((photo) => (
                          <div key={photo.id} className="aspect-square">
                            <img 
                              src={photo.url}
                              alt={photo.originalFilename}
                              className="w-full h-full object-cover rounded"
                            />
                          </div>
                        ))}
                      </div>
                      <Button 
                        className="w-full" 
                        size="lg"
                        onClick={handleAutoLayout}
                        data-testid="button-auto-layout"
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Apply Auto-Layout
                      </Button>
                    </>
                  )}
                </Card>
              </div>
            ) : (
              <div className="w-full max-w-6xl">
                <Card 
                  className={`bg-white aspect-[8.5/11] shadow-2xl relative overflow-hidden ${
                    canvasDropActive ? "ring-4 ring-primary ring-offset-4" : ""
                  }`}
                  data-testid="canvas-advanced"
                  onDragOver={handleCanvasDragOver}
                  onDragLeave={handleCanvasDragLeave}
                  onDrop={handleCanvasDrop}
                >
                  {/* Grid overlay for visual guidance */}
                  {canvasDropActive && (
                    <div 
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        backgroundImage: `
                          linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px),
                          linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px)
                        `,
                        backgroundSize: "20px 20px",
                      }}
                    />
                  )}

                  {/* Placed photos */}
                  {placedPhotos.map((photo) => (
                    <div
                      key={photo.id}
                      className="absolute cursor-move hover:ring-2 hover:ring-primary transition-all"
                      style={{
                        left: `${photo.x}px`,
                        top: `${photo.y}px`,
                        width: `${photo.width}px`,
                        height: `${photo.height}px`,
                        transform: `rotate(${photo.rotation}deg)`,
                        zIndex: photo.zIndex,
                      }}
                      data-testid={`placed-photo-${photo.id}`}
                    >
                      <img 
                        src={photo.photoUrl}
                        alt="Placed photo"
                        className="w-full h-full object-cover rounded shadow-lg"
                        draggable={false}
                      />
                    </div>
                  ))}

                  {/* Drop zone hint */}
                  {placedPhotos.length === 0 && !canvasDropActive && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <Grid3x3 className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          Drag photos from your library to place them here
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Photos will snap to a 20px grid
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Active drag indicator */}
                  {canvasDropActive && (
                    <div className="absolute inset-0 flex items-center justify-center bg-primary/10 pointer-events-none">
                      <div className="text-center">
                        <Plus className="h-16 w-16 mx-auto mb-2 text-primary" />
                        <p className="text-primary font-semibold">
                          Drop photo here
                        </p>
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar - Properties */}
        <div className="w-80 border-l border-border bg-card overflow-y-auto p-4">
          <h3 className="font-semibold mb-4" data-testid="text-properties">Properties</h3>
          
          <div className="space-y-6">
            <div>
              <label className="text-sm font-medium mb-2 block">Page Navigation</label>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="flex-1 text-center text-sm" data-testid="text-current-page">
                  Page {currentPage} of 20
                </span>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setCurrentPage(Math.min(20, currentPage + 1))}
                  disabled={currentPage === 20}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {selectedMode === "advanced" && selectedPhotoId && (
              <>
                <div>
                  <label className="text-sm font-medium mb-2 block">Position</label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs w-8">X:</span>
                      <Slider defaultValue={[50]} max={100} step={1} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs w-8">Y:</span>
                      <Slider defaultValue={[50]} max={100} step={1} />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Size</label>
                  <Slider defaultValue={[75]} max={100} step={1} />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Rotation</label>
                  <div className="flex items-center gap-2">
                    <Slider defaultValue={[0]} min={-180} max={180} step={1} className="flex-1" />
                    <Button variant="outline" size="sm">
                      <RotateCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">Layout Templates</label>
              <div className="grid grid-cols-2 gap-2">
                {["Single", "Dual", "Grid", "Collage"].map((layout) => (
                  <Button 
                    key={layout}
                    variant="outline" 
                    size="sm"
                    className="h-20"
                    data-testid={`button-layout-${layout.toLowerCase()}`}
                  >
                    <Grid3x3 className="h-6 w-6" />
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3D Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>3D Preview</DialogTitle>
          </DialogHeader>
          <div className="flex-1 bg-gradient-to-br from-muted to-background rounded-lg flex items-center justify-center">
            <div className="text-center">
              <Eye className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">
                3D preview will show your photobook as it will appear in print
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
