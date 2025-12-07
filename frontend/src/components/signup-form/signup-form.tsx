import { Button } from '../ui/button';
import {
   Card,
   CardContent,
   CardDescription,
   CardHeader,
   CardTitle,
} from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {Link} from 'react-router-dom';

export function SignupForm() {
   return (
      <Card className="mx-auto max-w-sm">
         <CardHeader className="text-center">
            <CardTitle className="text-2xl">Create your account</CardTitle>
            <CardDescription>
               Enter your information to create an account
            </CardDescription>
         </CardHeader>

         <CardContent className="space-y-4">
            <div className="space-y-2">
               <Label htmlFor="name">Full Name</Label>
               <Input id="name" placeholder="John Doe" required />
            </div>

            <div className="space-y-2">
               <Label htmlFor="email">Email</Label>
               <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
               />
            </div>

            <div className="space-y-2">
               <Label htmlFor="password">Password</Label>
               <Input id="password" type="password" required />
            </div>

            <div className="space-y-2">
               <Label htmlFor="confirm">Confirm Password</Label>
               <Input id="confirm" type="password" required />
            </div>

            <Button className="w-full" size="lg">
               Create Account
            </Button>

            <div className="text-center text-sm">
               Already have an account?{' '}
               <Link to="/log-in">Log In</Link>
            </div>
         </CardContent>
      </Card>
   );
}
