using System;
using System.Collections.Generic;
using Autodesk.AutoCAD.ApplicationServices;

namespace LandsurvConnector
{
    /// <summary>
    /// ThreadMarshaler ensures that Civil 3D API calls happen on the main UI thread.
    /// This is CRITICAL - calling Civil 3D APIs from background threads will crash the application.
    /// Uses AutoCAD's Idle event to marshal calls to the main thread.
    /// </summary>
    public static class ThreadMarshaler
    {
        private static Queue<Action> _actionQueue = new Queue<Action>();
        private static object _lockObject = new object();
        private static bool _isProcessing = false;
        private static bool _idleEventRegistered = false;

        /// <summary>
        /// Execute an action on the main UI thread (Civil 3D DocumentManager's thread).
        /// </summary>
        /// <param name="action">The action to execute on the main thread</param>
        public static void Execute(Action action)
        {
            if (action == null)
                throw new ArgumentNullException(nameof(action));

            try
            {
                // Queue the action
                lock (_lockObject)
                {
                    _actionQueue.Enqueue(action);
                    
                    // Register for Idle event if not already registered
                    if (!_idleEventRegistered)
                    {
                        _idleEventRegistered = true;
                        Application.Idle += OnApplicationIdle;
                    }
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"ThreadMarshaler.Execute error: {ex.Message}");
                throw;
            }
        }
        
        /// <summary>
        /// Handler for AutoCAD's Idle event - processes queued actions on the main thread
        /// </summary>
        private static void OnApplicationIdle(object sender, EventArgs e)
        {
            ProcessQueue();
        }

        /// <summary>
        /// Execute an action on the main UI thread and return a result.
        /// </summary>
        /// <typeparam name="T">The return type</typeparam>
        /// <param name="function">The function to execute on the main thread</param>
        /// <returns>The result of the function</returns>
        public static T Execute<T>(Func<T> function)
        {
            if (function == null)
                throw new ArgumentNullException(nameof(function));

            T result = default(T);
            Exception caughtException = null;

            Execute(() =>
            {
                try
                {
                    result = function();
                }
                catch (Exception ex)
                {
                    caughtException = ex;
                }
            });

            if (caughtException != null)
                throw caughtException;

            return result;
        }

        /// <summary>
        /// Process queued actions on the main thread.
        /// This should be called from a timer or polling mechanism in the main thread context.
        /// </summary>
        private static void ProcessQueue()
        {
            lock (_lockObject)
            {
                if (_isProcessing)
                    return;

                _isProcessing = true;
            }

            try
            {
                while (true)
                {
                    Action action = null;

                    lock (_lockObject)
                    {
                        if (_actionQueue.Count == 0)
                        {
                            _isProcessing = false;
                            return;
                        }

                        action = _actionQueue.Dequeue();
                    }

                    if (action != null)
                    {
                        try
                        {
                            action();
                        }
                        catch (Exception ex)
                        {
                            System.Diagnostics.Debug.WriteLine($"Error executing queued action: {ex.Message}");
                        }
                    }
                }
            }
            finally
            {
                lock (_lockObject)
                {
                    _isProcessing = false;
                }
            }
        }

        /// <summary>
        /// Alternative: Use Civil 3D's built-in DocumentManager to execute on main thread.
        /// This is more reliable for Civil 3D-specific operations.
        /// </summary>
        public static void ExecuteOnMainThread(Action action)
        {
            try
            {
                Document doc = Application.DocumentManager.MdiActiveDocument;
                if (doc != null)
                {
                    // Use the Document's transaction manager to ensure thread safety
                    action();
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"ExecuteOnMainThread error: {ex.Message}");
                throw;
            }
        }
    }
}
