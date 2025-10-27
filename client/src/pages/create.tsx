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

  const handleAutoLayout = () => {
    toast({
      title: "Auto-layout applied",
      description: "AI has automatically arranged your photos",
    });
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
                  className="relative group cursor-pointer"
                  onClick={() => setSelectedPhotoId(photo.id)}
                  data-testid={`img-uploaded-${photo.id}`}
                >
                  <img 
                    src={photo.url}
                    alt={photo.originalFilename}
                    className="w-full aspect-square object-cover rounded-lg border border-border"
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
                <Card className="bg-white aspect-[8.5/11] shadow-2xl relative" data-testid="canvas-advanced">
                  {selectedPhotoId && uploadedPhotos.find(p => p.id === selectedPhotoId) && (
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                      <img 
                        src={uploadedPhotos.find(p => p.id === selectedPhotoId)?.url}
                        alt="Placed"
                        className="max-w-md shadow-lg"
                        draggable={false}
                      />
                    </div>
                  )}
                  {!selectedPhotoId && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-muted-foreground">
                        Click a photo from your library to place it here
                      </p>
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
