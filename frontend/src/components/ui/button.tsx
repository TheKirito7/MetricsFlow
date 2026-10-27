import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
const buttonVariants = cva(
  'button inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-transparent px-3.5 py-2 text-sm font-medium leading-normal transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-55',
  {
    variants: {
      variant: {
        default: 'bg-primary text-white shadow-sm hover:bg-[#1e54cf]',
        outline: 'border-border bg-card text-foreground shadow-sm hover:bg-muted',
        ghost: 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
        destructive: 'bg-[#b83240] text-white hover:bg-[#992536]',
      },
      size: {
        default: 'min-h-10',
        sm: 'min-h-8 px-2.5 py-1.5 text-xs',
        icon: 'size-10 min-h-10 p-2',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
