'use client'

import { Waves } from "@/components/ui/wave-background"

function WavesDemo() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full bg-black">
      {/* Centered content with aspect ratio */}
      <div className="w-full flex flex-col items-center">
        {/* Top border - thin white line */}
        <div className="w-full h-[1px] bg-white/80"></div>
        
        {/* 16:9 container that's full width */}
        <div className="w-full aspect-video relative">
          <Waves className="h-full w-full" />
        </div>
        
        {/* Bottom border - thin white line */}
        <div className="w-full h-[1px] bg-white/80"></div>
      </div>
    </div>
  )
}

export { WavesDemo }
